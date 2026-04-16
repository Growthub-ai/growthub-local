#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../packages/shared/src/constants.ts
var COMPANY_STATUSES, DEPLOYMENT_MODES, DEPLOYMENT_EXPOSURES, AUTH_BASE_URL_MODES, SURFACE_PROFILES, AGENT_STATUSES, AGENT_ADAPTER_TYPES, AGENT_ROLES, AGENT_ICON_NAMES, TICKET_STAGE_KINDS, TICKET_STAGE_HANDOFF_MODES, TICKET_STATUSES, ISSUE_STATUSES, ISSUE_PRIORITIES, GOAL_LEVELS, GOAL_STATUSES, PROJECT_STATUSES, APPROVAL_TYPES, SECRET_PROVIDERS, STORAGE_PROVIDERS, BILLING_TYPES, FINANCE_EVENT_KINDS, FINANCE_DIRECTIONS, FINANCE_UNITS, BUDGET_SCOPE_TYPES, BUDGET_METRICS, BUDGET_WINDOW_KINDS, BUDGET_INCIDENT_RESOLUTION_ACTIONS, INVITE_JOIN_TYPES, JOIN_REQUEST_TYPES, JOIN_REQUEST_STATUSES, PERMISSION_KEYS, PLUGIN_STATUSES, PLUGIN_CATEGORIES, PLUGIN_CAPABILITIES, PLUGIN_UI_SLOT_TYPES, PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS, PLUGIN_LAUNCHER_PLACEMENT_ZONES, PLUGIN_LAUNCHER_ACTIONS, PLUGIN_LAUNCHER_BOUNDS, PLUGIN_LAUNCHER_RENDER_ENVIRONMENTS, PLUGIN_UI_SLOT_ENTITY_TYPES, PLUGIN_STATE_SCOPE_KINDS;
var init_constants = __esm({
  "../packages/shared/src/constants.ts"() {
    "use strict";
    COMPANY_STATUSES = ["active", "paused", "archived"];
    DEPLOYMENT_MODES = ["local_trusted", "authenticated"];
    DEPLOYMENT_EXPOSURES = ["private", "public"];
    AUTH_BASE_URL_MODES = ["auto", "explicit"];
    SURFACE_PROFILES = ["dx", "gtm"];
    AGENT_STATUSES = [
      "active",
      "paused",
      "idle",
      "running",
      "error",
      "pending_approval",
      "terminated"
    ];
    AGENT_ADAPTER_TYPES = [
      "process",
      "http",
      "claude_local",
      "codex_local",
      "opencode_local",
      "pi_local",
      "cursor",
      "openclaw_gateway",
      "hermes_local",
      "qwen_local"
    ];
    AGENT_ROLES = [
      "ceo",
      "cto",
      "cmo",
      "cfo",
      "engineer",
      "designer",
      "pm",
      "qa",
      "devops",
      "researcher",
      "general"
    ];
    AGENT_ICON_NAMES = [
      "bot",
      "cpu",
      "brain",
      "zap",
      "rocket",
      "code",
      "terminal",
      "shield",
      "eye",
      "search",
      "wrench",
      "hammer",
      "lightbulb",
      "sparkles",
      "star",
      "heart",
      "flame",
      "bug",
      "cog",
      "database",
      "globe",
      "lock",
      "mail",
      "message-square",
      "file-code",
      "git-branch",
      "package",
      "puzzle",
      "target",
      "wand",
      "atom",
      "circuit-board",
      "radar",
      "swords",
      "telescope",
      "microscope",
      "crown",
      "gem",
      "hexagon",
      "pentagon",
      "fingerprint"
    ];
    TICKET_STAGE_KINDS = [
      "planning",
      "execution",
      "review",
      "qa",
      "human",
      "custom"
    ];
    TICKET_STAGE_HANDOFF_MODES = [
      "seamless",
      "context_only",
      "manual"
    ];
    TICKET_STATUSES = [
      "active",
      "paused",
      "completed",
      "archived",
      "done",
      "cancelled"
    ];
    ISSUE_STATUSES = [
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "done",
      "blocked",
      "cancelled"
    ];
    ISSUE_PRIORITIES = ["critical", "high", "medium", "low"];
    GOAL_LEVELS = ["company", "team", "agent", "task"];
    GOAL_STATUSES = ["planned", "active", "achieved", "cancelled"];
    PROJECT_STATUSES = [
      "backlog",
      "planned",
      "in_progress",
      "completed",
      "cancelled"
    ];
    APPROVAL_TYPES = ["hire_agent", "approve_ceo_strategy", "budget_override_required"];
    SECRET_PROVIDERS = [
      "local_encrypted",
      "aws_secrets_manager",
      "gcp_secret_manager",
      "vault"
    ];
    STORAGE_PROVIDERS = ["local_disk", "s3"];
    BILLING_TYPES = [
      "metered_api",
      "subscription_included",
      "subscription_overage",
      "credits",
      "fixed",
      "unknown"
    ];
    FINANCE_EVENT_KINDS = [
      "inference_charge",
      "platform_fee",
      "credit_purchase",
      "credit_refund",
      "credit_expiry",
      "byok_fee",
      "gateway_overhead",
      "log_storage_charge",
      "logpush_charge",
      "provisioned_capacity_charge",
      "training_charge",
      "custom_model_import_charge",
      "custom_model_storage_charge",
      "manual_adjustment"
    ];
    FINANCE_DIRECTIONS = ["debit", "credit"];
    FINANCE_UNITS = [
      "input_token",
      "output_token",
      "cached_input_token",
      "request",
      "credit_usd",
      "credit_unit",
      "model_unit_minute",
      "model_unit_hour",
      "gb_month",
      "train_token",
      "unknown"
    ];
    BUDGET_SCOPE_TYPES = ["company", "agent", "project"];
    BUDGET_METRICS = ["billed_cents"];
    BUDGET_WINDOW_KINDS = ["calendar_month_utc", "lifetime"];
    BUDGET_INCIDENT_RESOLUTION_ACTIONS = [
      "keep_paused",
      "raise_budget_and_resume"
    ];
    INVITE_JOIN_TYPES = ["human", "agent", "both"];
    JOIN_REQUEST_TYPES = ["human", "agent"];
    JOIN_REQUEST_STATUSES = ["pending_approval", "approved", "rejected"];
    PERMISSION_KEYS = [
      "agents:create",
      "users:invite",
      "users:manage_permissions",
      "tasks:assign",
      "tasks:assign_scope",
      "joins:approve"
    ];
    PLUGIN_STATUSES = [
      "installed",
      "ready",
      "disabled",
      "error",
      "upgrade_pending",
      "uninstalled"
    ];
    PLUGIN_CATEGORIES = [
      "connector",
      "workspace",
      "automation",
      "ui"
    ];
    PLUGIN_CAPABILITIES = [
      // Data Read
      "companies.read",
      "projects.read",
      "project.workspaces.read",
      "issues.read",
      "issue.comments.read",
      "issue.documents.read",
      "agents.read",
      "goals.read",
      "goals.create",
      "goals.update",
      "activity.read",
      "costs.read",
      // Data Write
      "issues.create",
      "issues.update",
      "issue.comments.create",
      "issue.documents.write",
      "agents.pause",
      "agents.resume",
      "agents.invoke",
      "agent.sessions.create",
      "agent.sessions.list",
      "agent.sessions.send",
      "agent.sessions.close",
      "activity.log.write",
      "metrics.write",
      // Plugin State
      "plugin.state.read",
      "plugin.state.write",
      // Runtime / Integration
      "events.subscribe",
      "events.emit",
      "jobs.schedule",
      "webhooks.receive",
      "http.outbound",
      "secrets.read-ref",
      // Agent Tools
      "agent.tools.register",
      // UI
      "instance.settings.register",
      "ui.sidebar.register",
      "ui.page.register",
      "ui.detailTab.register",
      "ui.dashboardWidget.register",
      "ui.commentAnnotation.register",
      "ui.action.register"
    ];
    PLUGIN_UI_SLOT_TYPES = [
      "page",
      "detailTab",
      "taskDetailView",
      "dashboardWidget",
      "sidebar",
      "sidebarPanel",
      "projectSidebarItem",
      "globalToolbarButton",
      "toolbarButton",
      "contextMenuItem",
      "commentAnnotation",
      "commentContextMenuItem",
      "settingsPage"
    ];
    PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS = [
      "dashboard",
      "onboarding",
      "companies",
      "company",
      "settings",
      "plugins",
      "org",
      "agents",
      "projects",
      "tickets",
      "issues",
      "goals",
      "approvals",
      "costs",
      "activity",
      "inbox",
      "design-guide",
      "tests"
    ];
    PLUGIN_LAUNCHER_PLACEMENT_ZONES = [
      "page",
      "detailTab",
      "taskDetailView",
      "dashboardWidget",
      "sidebar",
      "sidebarPanel",
      "projectSidebarItem",
      "globalToolbarButton",
      "toolbarButton",
      "contextMenuItem",
      "commentAnnotation",
      "commentContextMenuItem",
      "settingsPage"
    ];
    PLUGIN_LAUNCHER_ACTIONS = [
      "navigate",
      "openModal",
      "openDrawer",
      "openPopover",
      "performAction",
      "deepLink"
    ];
    PLUGIN_LAUNCHER_BOUNDS = [
      "inline",
      "compact",
      "default",
      "wide",
      "full"
    ];
    PLUGIN_LAUNCHER_RENDER_ENVIRONMENTS = [
      "hostInline",
      "hostOverlay",
      "hostRoute",
      "external",
      "iframe"
    ];
    PLUGIN_UI_SLOT_ENTITY_TYPES = [
      "project",
      "issue",
      "agent",
      "goal",
      "run",
      "comment"
    ];
    PLUGIN_STATE_SCOPE_KINDS = [
      "instance",
      "company",
      "project",
      "project_workspace",
      "agent",
      "issue",
      "goal",
      "run"
    ];
  }
});

// ../packages/shared/src/validators/instance.ts
import { z } from "zod";
var instanceExperimentalSettingsSchema, patchInstanceExperimentalSettingsSchema;
var init_instance = __esm({
  "../packages/shared/src/validators/instance.ts"() {
    "use strict";
    instanceExperimentalSettingsSchema = z.object({
      enableIsolatedWorkspaces: z.boolean().default(false)
    }).strict();
    patchInstanceExperimentalSettingsSchema = instanceExperimentalSettingsSchema.partial();
  }
});

// ../packages/shared/src/validators/budget.ts
import { z as z2 } from "zod";
var upsertBudgetPolicySchema, resolveBudgetIncidentSchema;
var init_budget = __esm({
  "../packages/shared/src/validators/budget.ts"() {
    "use strict";
    init_constants();
    upsertBudgetPolicySchema = z2.object({
      scopeType: z2.enum(BUDGET_SCOPE_TYPES),
      scopeId: z2.string().uuid(),
      metric: z2.enum(BUDGET_METRICS).optional().default("billed_cents"),
      windowKind: z2.enum(BUDGET_WINDOW_KINDS).optional().default("calendar_month_utc"),
      amount: z2.number().int().nonnegative(),
      warnPercent: z2.number().int().min(1).max(99).optional().default(80),
      hardStopEnabled: z2.boolean().optional().default(true),
      notifyEnabled: z2.boolean().optional().default(true),
      isActive: z2.boolean().optional().default(true)
    });
    resolveBudgetIncidentSchema = z2.object({
      action: z2.enum(BUDGET_INCIDENT_RESOLUTION_ACTIONS),
      amount: z2.number().int().nonnegative().optional(),
      decisionNote: z2.string().optional().nullable()
    }).superRefine((value, ctx) => {
      if (value.action === "raise_budget_and_resume" && typeof value.amount !== "number") {
        ctx.addIssue({
          code: z2.ZodIssueCode.custom,
          message: "amount is required when raising a budget",
          path: ["amount"]
        });
      }
    });
  }
});

// ../packages/shared/src/validators/company.ts
import { z as z3 } from "zod";
var logoAssetIdSchema, createCompanySchema, updateCompanySchema, updateCompanyBrandingSchema;
var init_company = __esm({
  "../packages/shared/src/validators/company.ts"() {
    "use strict";
    init_constants();
    logoAssetIdSchema = z3.string().uuid().nullable().optional();
    createCompanySchema = z3.object({
      name: z3.string().min(1),
      description: z3.string().optional().nullable(),
      budgetMonthlyCents: z3.number().int().nonnegative().optional().default(0)
    });
    updateCompanySchema = createCompanySchema.partial().extend({
      status: z3.enum(COMPANY_STATUSES).optional(),
      spentMonthlyCents: z3.number().int().nonnegative().optional(),
      requireBoardApprovalForNewAgents: z3.boolean().optional(),
      brandColor: z3.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      logoAssetId: logoAssetIdSchema
    });
    updateCompanyBrandingSchema = z3.object({
      name: z3.string().min(1).optional(),
      description: z3.string().nullable().optional(),
      brandColor: z3.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      logoAssetId: logoAssetIdSchema
    });
  }
});

// ../packages/shared/src/validators/company-portability.ts
import { z as z4 } from "zod";
var portabilityIncludeSchema, portabilitySecretRequirementSchema, portabilityCompanyManifestEntrySchema, portabilityAgentManifestEntrySchema, portabilityManifestSchema, portabilitySourceSchema, portabilityTargetSchema, portabilityAgentSelectionSchema, portabilityCollisionStrategySchema, companyPortabilityExportSchema, companyPortabilityPreviewSchema;
var init_company_portability = __esm({
  "../packages/shared/src/validators/company-portability.ts"() {
    "use strict";
    portabilityIncludeSchema = z4.object({
      company: z4.boolean().optional(),
      agents: z4.boolean().optional()
    }).partial();
    portabilitySecretRequirementSchema = z4.object({
      key: z4.string().min(1),
      description: z4.string().nullable(),
      agentSlug: z4.string().min(1).nullable(),
      providerHint: z4.string().nullable()
    });
    portabilityCompanyManifestEntrySchema = z4.object({
      path: z4.string().min(1),
      name: z4.string().min(1),
      description: z4.string().nullable(),
      brandColor: z4.string().nullable(),
      requireBoardApprovalForNewAgents: z4.boolean()
    });
    portabilityAgentManifestEntrySchema = z4.object({
      slug: z4.string().min(1),
      name: z4.string().min(1),
      path: z4.string().min(1),
      role: z4.string().min(1),
      title: z4.string().nullable(),
      icon: z4.string().nullable(),
      capabilities: z4.string().nullable(),
      reportsToSlug: z4.string().min(1).nullable(),
      adapterType: z4.string().min(1),
      adapterConfig: z4.record(z4.unknown()),
      runtimeConfig: z4.record(z4.unknown()),
      permissions: z4.record(z4.unknown()),
      budgetMonthlyCents: z4.number().int().nonnegative(),
      metadata: z4.record(z4.unknown()).nullable()
    });
    portabilityManifestSchema = z4.object({
      schemaVersion: z4.number().int().positive(),
      generatedAt: z4.string().datetime(),
      source: z4.object({
        companyId: z4.string().uuid(),
        companyName: z4.string().min(1)
      }).nullable(),
      includes: z4.object({
        company: z4.boolean(),
        agents: z4.boolean()
      }),
      company: portabilityCompanyManifestEntrySchema.nullable(),
      agents: z4.array(portabilityAgentManifestEntrySchema),
      requiredSecrets: z4.array(portabilitySecretRequirementSchema).default([])
    });
    portabilitySourceSchema = z4.discriminatedUnion("type", [
      z4.object({
        type: z4.literal("inline"),
        manifest: portabilityManifestSchema,
        files: z4.record(z4.string())
      }),
      z4.object({
        type: z4.literal("url"),
        url: z4.string().url()
      }),
      z4.object({
        type: z4.literal("github"),
        url: z4.string().url()
      })
    ]);
    portabilityTargetSchema = z4.discriminatedUnion("mode", [
      z4.object({
        mode: z4.literal("new_company"),
        newCompanyName: z4.string().min(1).optional().nullable()
      }),
      z4.object({
        mode: z4.literal("existing_company"),
        companyId: z4.string().uuid()
      })
    ]);
    portabilityAgentSelectionSchema = z4.union([
      z4.literal("all"),
      z4.array(z4.string().min(1))
    ]);
    portabilityCollisionStrategySchema = z4.enum(["rename", "skip", "replace"]);
    companyPortabilityExportSchema = z4.object({
      include: portabilityIncludeSchema.optional()
    });
    companyPortabilityPreviewSchema = z4.object({
      source: portabilitySourceSchema,
      include: portabilityIncludeSchema.optional(),
      target: portabilityTargetSchema,
      agents: portabilityAgentSelectionSchema.optional(),
      collisionStrategy: portabilityCollisionStrategySchema.optional()
    });
  }
});

// ../packages/shared/src/validators/secret.ts
import { z as z5 } from "zod";
var envBindingPlainSchema, envBindingSecretRefSchema, envBindingSchema, envConfigSchema, createSecretSchema, rotateSecretSchema, updateSecretSchema;
var init_secret = __esm({
  "../packages/shared/src/validators/secret.ts"() {
    "use strict";
    init_constants();
    envBindingPlainSchema = z5.object({
      type: z5.literal("plain"),
      value: z5.string()
    });
    envBindingSecretRefSchema = z5.object({
      type: z5.literal("secret_ref"),
      secretId: z5.string().uuid(),
      version: z5.union([z5.literal("latest"), z5.number().int().positive()]).optional()
    });
    envBindingSchema = z5.union([
      z5.string(),
      envBindingPlainSchema,
      envBindingSecretRefSchema
    ]);
    envConfigSchema = z5.record(envBindingSchema);
    createSecretSchema = z5.object({
      name: z5.string().min(1),
      provider: z5.enum(SECRET_PROVIDERS).optional(),
      value: z5.string().min(1),
      description: z5.string().optional().nullable(),
      externalRef: z5.string().optional().nullable()
    });
    rotateSecretSchema = z5.object({
      value: z5.string().min(1),
      externalRef: z5.string().optional().nullable()
    });
    updateSecretSchema = z5.object({
      name: z5.string().min(1).optional(),
      description: z5.string().optional().nullable(),
      externalRef: z5.string().optional().nullable()
    });
  }
});

// ../packages/shared/src/validators/agent.ts
import { z as z6 } from "zod";
var agentPermissionsSchema, adapterConfigSchema, createAgentSchema, createAgentHireSchema, updateAgentSchema, updateAgentInstructionsPathSchema, createAgentKeySchema, wakeAgentSchema, resetAgentSessionSchema, testAdapterEnvironmentSchema, updateAgentPermissionsSchema;
var init_agent = __esm({
  "../packages/shared/src/validators/agent.ts"() {
    "use strict";
    init_constants();
    init_secret();
    agentPermissionsSchema = z6.object({
      canCreateAgents: z6.boolean().optional().default(false)
    });
    adapterConfigSchema = z6.record(z6.unknown()).superRefine((value, ctx) => {
      const envValue = value.env;
      if (envValue === void 0)
        return;
      const parsed = envConfigSchema.safeParse(envValue);
      if (!parsed.success) {
        ctx.addIssue({
          code: z6.ZodIssueCode.custom,
          message: "adapterConfig.env must be a map of valid env bindings",
          path: ["env"]
        });
      }
    });
    createAgentSchema = z6.object({
      name: z6.string().min(1),
      role: z6.enum(AGENT_ROLES).optional().default("general"),
      title: z6.string().optional().nullable(),
      icon: z6.enum(AGENT_ICON_NAMES).optional().nullable(),
      reportsTo: z6.string().uuid().optional().nullable(),
      capabilities: z6.string().optional().nullable(),
      adapterType: z6.enum(AGENT_ADAPTER_TYPES).optional().default("process"),
      adapterConfig: adapterConfigSchema.optional().default({}),
      runtimeConfig: z6.record(z6.unknown()).optional().default({}),
      budgetMonthlyCents: z6.number().int().nonnegative().optional().default(0),
      permissions: agentPermissionsSchema.optional(),
      metadata: z6.record(z6.unknown()).optional().nullable()
    });
    createAgentHireSchema = createAgentSchema.extend({
      sourceIssueId: z6.string().uuid().optional().nullable(),
      sourceIssueIds: z6.array(z6.string().uuid()).optional()
    });
    updateAgentSchema = createAgentSchema.omit({ permissions: true }).partial().extend({
      permissions: z6.never().optional(),
      status: z6.enum(AGENT_STATUSES).optional(),
      spentMonthlyCents: z6.number().int().nonnegative().optional()
    });
    updateAgentInstructionsPathSchema = z6.object({
      path: z6.string().trim().min(1).nullable(),
      adapterConfigKey: z6.string().trim().min(1).optional()
    });
    createAgentKeySchema = z6.object({
      name: z6.string().min(1).default("default")
    });
    wakeAgentSchema = z6.object({
      source: z6.enum(["timer", "assignment", "on_demand", "automation"]).optional().default("on_demand"),
      triggerDetail: z6.enum(["manual", "ping", "callback", "system"]).optional(),
      reason: z6.string().optional().nullable(),
      payload: z6.record(z6.unknown()).optional().nullable(),
      idempotencyKey: z6.string().optional().nullable(),
      forceFreshSession: z6.preprocess(
        (value) => value === null ? void 0 : value,
        z6.boolean().optional().default(false)
      )
    });
    resetAgentSessionSchema = z6.object({
      taskKey: z6.string().min(1).optional().nullable()
    });
    testAdapterEnvironmentSchema = z6.object({
      adapterConfig: adapterConfigSchema.optional().default({})
    });
    updateAgentPermissionsSchema = z6.object({
      canCreateAgents: z6.boolean(),
      canAssignTasks: z6.boolean()
    });
  }
});

// ../packages/shared/src/validators/project.ts
import { z as z7 } from "zod";
function validateProjectWorkspace(value, ctx) {
  const sourceType = value.sourceType ?? "local_path";
  const hasCwd = typeof value.cwd === "string" && value.cwd.trim().length > 0;
  const hasRepo = typeof value.repoUrl === "string" && value.repoUrl.trim().length > 0;
  const hasRemoteRef = typeof value.remoteWorkspaceRef === "string" && value.remoteWorkspaceRef.trim().length > 0;
  if (sourceType === "remote_managed") {
    if (!hasRemoteRef && !hasRepo) {
      ctx.addIssue({
        code: z7.ZodIssueCode.custom,
        message: "Remote-managed workspace requires remoteWorkspaceRef or repoUrl.",
        path: ["remoteWorkspaceRef"]
      });
    }
    return;
  }
  if (!hasCwd && !hasRepo) {
    ctx.addIssue({
      code: z7.ZodIssueCode.custom,
      message: "Workspace requires at least one of cwd or repoUrl.",
      path: ["cwd"]
    });
  }
}
var executionWorkspaceStrategySchema, projectExecutionWorkspacePolicySchema, projectWorkspaceSourceTypeSchema, projectWorkspaceVisibilitySchema, projectWorkspaceFields, createProjectWorkspaceSchema, updateProjectWorkspaceSchema, projectFields, createProjectSchema, updateProjectSchema;
var init_project = __esm({
  "../packages/shared/src/validators/project.ts"() {
    "use strict";
    init_constants();
    executionWorkspaceStrategySchema = z7.object({
      type: z7.enum(["project_primary", "git_worktree", "adapter_managed", "cloud_sandbox"]).optional(),
      baseRef: z7.string().optional().nullable(),
      branchTemplate: z7.string().optional().nullable(),
      worktreeParentDir: z7.string().optional().nullable(),
      provisionCommand: z7.string().optional().nullable(),
      teardownCommand: z7.string().optional().nullable()
    }).strict();
    projectExecutionWorkspacePolicySchema = z7.object({
      enabled: z7.boolean(),
      defaultMode: z7.enum(["shared_workspace", "isolated_workspace", "operator_branch", "adapter_default"]).optional(),
      allowIssueOverride: z7.boolean().optional(),
      defaultProjectWorkspaceId: z7.string().uuid().optional().nullable(),
      workspaceStrategy: executionWorkspaceStrategySchema.optional().nullable(),
      workspaceRuntime: z7.record(z7.unknown()).optional().nullable(),
      branchPolicy: z7.record(z7.unknown()).optional().nullable(),
      pullRequestPolicy: z7.record(z7.unknown()).optional().nullable(),
      runtimePolicy: z7.record(z7.unknown()).optional().nullable(),
      cleanupPolicy: z7.record(z7.unknown()).optional().nullable()
    }).strict();
    projectWorkspaceSourceTypeSchema = z7.enum(["local_path", "git_repo", "remote_managed", "non_git_path"]);
    projectWorkspaceVisibilitySchema = z7.enum(["default", "advanced"]);
    projectWorkspaceFields = {
      name: z7.string().min(1).optional(),
      sourceType: projectWorkspaceSourceTypeSchema.optional(),
      cwd: z7.string().min(1).optional().nullable(),
      repoUrl: z7.string().url().optional().nullable(),
      repoRef: z7.string().optional().nullable(),
      defaultRef: z7.string().optional().nullable(),
      visibility: projectWorkspaceVisibilitySchema.optional(),
      setupCommand: z7.string().optional().nullable(),
      cleanupCommand: z7.string().optional().nullable(),
      remoteProvider: z7.string().optional().nullable(),
      remoteWorkspaceRef: z7.string().optional().nullable(),
      sharedWorkspaceKey: z7.string().optional().nullable(),
      metadata: z7.record(z7.unknown()).optional().nullable()
    };
    createProjectWorkspaceSchema = z7.object({
      ...projectWorkspaceFields,
      isPrimary: z7.boolean().optional().default(false)
    }).superRefine(validateProjectWorkspace);
    updateProjectWorkspaceSchema = z7.object({
      ...projectWorkspaceFields,
      isPrimary: z7.boolean().optional()
    }).partial();
    projectFields = {
      /** @deprecated Use goalIds instead */
      goalId: z7.string().uuid().optional().nullable(),
      goalIds: z7.array(z7.string().uuid()).optional(),
      name: z7.string().min(1),
      description: z7.string().optional().nullable(),
      status: z7.enum(PROJECT_STATUSES).optional().default("backlog"),
      leadAgentId: z7.string().uuid().optional().nullable(),
      targetDate: z7.string().optional().nullable(),
      color: z7.string().optional().nullable(),
      executionWorkspacePolicy: projectExecutionWorkspacePolicySchema.optional().nullable(),
      archivedAt: z7.string().datetime().optional().nullable()
    };
    createProjectSchema = z7.object({
      ...projectFields,
      workspace: createProjectWorkspaceSchema.optional()
    });
    updateProjectSchema = z7.object(projectFields).partial();
  }
});

// ../packages/shared/src/validators/issue.ts
import { z as z8 } from "zod";
var executionWorkspaceStrategySchema2, issueExecutionWorkspaceSettingsSchema, issueAssigneeAdapterOverridesSchema, createIssueSchema, batchDelegateIssuesSchema, createIssueLabelSchema, updateIssueSchema, checkoutIssueSchema, addIssueCommentSchema, linkIssueApprovalSchema, createIssueAttachmentMetadataSchema, ISSUE_DOCUMENT_FORMATS, issueDocumentFormatSchema, issueDocumentKeySchema, upsertIssueDocumentSchema;
var init_issue = __esm({
  "../packages/shared/src/validators/issue.ts"() {
    "use strict";
    init_constants();
    executionWorkspaceStrategySchema2 = z8.object({
      type: z8.enum(["project_primary", "git_worktree", "adapter_managed", "cloud_sandbox"]).optional(),
      baseRef: z8.string().optional().nullable(),
      branchTemplate: z8.string().optional().nullable(),
      worktreeParentDir: z8.string().optional().nullable(),
      provisionCommand: z8.string().optional().nullable(),
      teardownCommand: z8.string().optional().nullable()
    }).strict();
    issueExecutionWorkspaceSettingsSchema = z8.object({
      mode: z8.enum(["inherit", "shared_workspace", "isolated_workspace", "operator_branch", "reuse_existing", "agent_default"]).optional(),
      workspaceStrategy: executionWorkspaceStrategySchema2.optional().nullable(),
      workspaceRuntime: z8.record(z8.unknown()).optional().nullable()
    }).strict();
    issueAssigneeAdapterOverridesSchema = z8.object({
      adapterConfig: z8.record(z8.unknown()).optional(),
      useProjectWorkspace: z8.boolean().optional()
    }).strict();
    createIssueSchema = z8.object({
      ticketId: z8.string().uuid().optional().nullable(),
      ticketStage: z8.string().optional().nullable(),
      projectId: z8.string().uuid().optional().nullable(),
      projectWorkspaceId: z8.string().uuid().optional().nullable(),
      goalId: z8.string().uuid().optional().nullable(),
      parentId: z8.string().uuid().optional().nullable(),
      title: z8.string().min(1),
      description: z8.string().optional().nullable(),
      status: z8.enum(ISSUE_STATUSES).optional().default("backlog"),
      priority: z8.enum(ISSUE_PRIORITIES).optional().default("medium"),
      assigneeAgentId: z8.string().uuid().optional().nullable(),
      assigneeUserId: z8.string().optional().nullable(),
      requestDepth: z8.number().int().nonnegative().optional().default(0),
      billingCode: z8.string().optional().nullable(),
      assigneeAdapterOverrides: issueAssigneeAdapterOverridesSchema.optional().nullable(),
      executionWorkspaceId: z8.string().uuid().optional().nullable(),
      executionWorkspacePreference: z8.enum([
        "inherit",
        "shared_workspace",
        "isolated_workspace",
        "operator_branch",
        "reuse_existing",
        "agent_default"
      ]).optional().nullable(),
      executionWorkspaceSettings: issueExecutionWorkspaceSettingsSchema.optional().nullable(),
      labelIds: z8.array(z8.string().uuid()).optional()
    });
    batchDelegateIssuesSchema = z8.object({
      issues: z8.array(createIssueSchema).min(1).max(50)
    });
    createIssueLabelSchema = z8.object({
      name: z8.string().trim().min(1).max(48),
      color: z8.string().regex(/^#(?:[0-9a-fA-F]{6})$/, "Color must be a 6-digit hex value")
    });
    updateIssueSchema = createIssueSchema.partial().extend({
      comment: z8.string().min(1).optional(),
      hiddenAt: z8.string().datetime().nullable().optional()
    });
    checkoutIssueSchema = z8.object({
      agentId: z8.string().uuid(),
      expectedStatuses: z8.array(z8.enum(ISSUE_STATUSES)).nonempty()
    });
    addIssueCommentSchema = z8.object({
      body: z8.string().min(1),
      reopen: z8.boolean().optional(),
      interrupt: z8.boolean().optional()
    });
    linkIssueApprovalSchema = z8.object({
      approvalId: z8.string().uuid()
    });
    createIssueAttachmentMetadataSchema = z8.object({
      issueCommentId: z8.string().uuid().optional().nullable()
    });
    ISSUE_DOCUMENT_FORMATS = ["markdown"];
    issueDocumentFormatSchema = z8.enum(ISSUE_DOCUMENT_FORMATS);
    issueDocumentKeySchema = z8.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/, "Document key must be lowercase letters, numbers, _ or -");
    upsertIssueDocumentSchema = z8.object({
      title: z8.string().trim().max(200).nullable().optional(),
      format: issueDocumentFormatSchema,
      body: z8.string().max(524288),
      changeSummary: z8.string().trim().max(500).nullable().optional(),
      baseRevisionId: z8.string().uuid().nullable().optional()
    });
  }
});

// ../packages/shared/src/validators/work-product.ts
import { z as z9 } from "zod";
var issueWorkProductTypeSchema, issueWorkProductStatusSchema, issueWorkProductReviewStateSchema, createIssueWorkProductSchema, updateIssueWorkProductSchema;
var init_work_product = __esm({
  "../packages/shared/src/validators/work-product.ts"() {
    "use strict";
    issueWorkProductTypeSchema = z9.enum([
      "preview_url",
      "runtime_service",
      "pull_request",
      "branch",
      "commit",
      "artifact",
      "document"
    ]);
    issueWorkProductStatusSchema = z9.enum([
      "active",
      "ready_for_review",
      "approved",
      "changes_requested",
      "merged",
      "closed",
      "failed",
      "archived",
      "draft"
    ]);
    issueWorkProductReviewStateSchema = z9.enum([
      "none",
      "needs_board_review",
      "approved",
      "changes_requested"
    ]);
    createIssueWorkProductSchema = z9.object({
      projectId: z9.string().uuid().optional().nullable(),
      executionWorkspaceId: z9.string().uuid().optional().nullable(),
      runtimeServiceId: z9.string().uuid().optional().nullable(),
      type: issueWorkProductTypeSchema,
      provider: z9.string().min(1),
      externalId: z9.string().optional().nullable(),
      title: z9.string().min(1),
      url: z9.string().url().optional().nullable(),
      status: issueWorkProductStatusSchema.default("active"),
      reviewState: issueWorkProductReviewStateSchema.optional().default("none"),
      isPrimary: z9.boolean().optional().default(false),
      healthStatus: z9.enum(["unknown", "healthy", "unhealthy"]).optional().default("unknown"),
      summary: z9.string().optional().nullable(),
      metadata: z9.record(z9.unknown()).optional().nullable(),
      createdByRunId: z9.string().uuid().optional().nullable()
    });
    updateIssueWorkProductSchema = createIssueWorkProductSchema.partial();
  }
});

// ../packages/shared/src/validators/execution-workspace.ts
import { z as z10 } from "zod";
var executionWorkspaceStatusSchema, updateExecutionWorkspaceSchema;
var init_execution_workspace = __esm({
  "../packages/shared/src/validators/execution-workspace.ts"() {
    "use strict";
    executionWorkspaceStatusSchema = z10.enum([
      "active",
      "idle",
      "in_review",
      "archived",
      "cleanup_failed"
    ]);
    updateExecutionWorkspaceSchema = z10.object({
      status: executionWorkspaceStatusSchema.optional(),
      cleanupEligibleAt: z10.string().datetime().optional().nullable(),
      cleanupReason: z10.string().optional().nullable(),
      metadata: z10.record(z10.unknown()).optional().nullable()
    }).strict();
  }
});

// ../packages/shared/src/ticket-stages.ts
function normalizeTicketStageKey(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}
var init_ticket_stages = __esm({
  "../packages/shared/src/ticket-stages.ts"() {
    "use strict";
    init_constants();
  }
});

// ../packages/shared/src/validators/ticket.ts
import { z as z11 } from "zod";
var ticketStageDefinitionSchema, ticketStageDefinitionsSchema, createTicketSchema, updateTicketSchema, advanceTicketStageSchema;
var init_ticket = __esm({
  "../packages/shared/src/validators/ticket.ts"() {
    "use strict";
    init_constants();
    init_ticket_stages();
    ticketStageDefinitionSchema = z11.object({
      key: z11.string().min(1),
      label: z11.string().min(1).max(120),
      kind: z11.enum(TICKET_STAGE_KINDS).nullable().optional(),
      ownerRole: z11.enum(AGENT_ROLES).nullable().optional(),
      handoffMode: z11.enum(TICKET_STAGE_HANDOFF_MODES).nullable().optional(),
      instructions: z11.string().nullable().optional(),
      exitCriteria: z11.string().nullable().optional(),
      metadata: z11.record(z11.unknown()).nullable().optional()
    });
    ticketStageDefinitionsSchema = z11.array(ticketStageDefinitionSchema).min(1).superRefine((value, ctx) => {
      const seen = /* @__PURE__ */ new Set();
      value.forEach((definition, index51) => {
        const normalizedKey = normalizeTicketStageKey(String(definition.key));
        if (!normalizedKey) {
          ctx.addIssue({
            code: z11.ZodIssueCode.custom,
            path: [index51, "key"],
            message: "Stage key must not be empty"
          });
          return;
        }
        if (seen.has(normalizedKey)) {
          ctx.addIssue({
            code: z11.ZodIssueCode.custom,
            path: [index51, "key"],
            message: "Stage keys must be unique"
          });
          return;
        }
        seen.add(normalizedKey);
      });
    });
    createTicketSchema = z11.object({
      title: z11.string().min(1).max(500),
      description: z11.string().optional(),
      stageOrder: z11.array(z11.string().min(1)).min(1).optional(),
      stageDefinitions: ticketStageDefinitionsSchema.optional(),
      metadata: z11.record(z11.unknown()).optional(),
      instructions: z11.string().optional(),
      leadAgentId: z11.string().uuid().nullable().optional()
    });
    updateTicketSchema = z11.object({
      title: z11.string().min(1).max(500).optional(),
      description: z11.string().nullable().optional(),
      status: z11.enum(TICKET_STATUSES).optional(),
      currentStage: z11.string().min(1).optional(),
      stageOrder: z11.array(z11.string().min(1)).min(1).optional(),
      stageDefinitions: ticketStageDefinitionsSchema.optional(),
      metadata: z11.record(z11.unknown()).optional(),
      instructions: z11.string().optional(),
      leadAgentId: z11.string().uuid().nullable().optional()
    });
    advanceTicketStageSchema = z11.object({});
  }
});

// ../packages/shared/src/validators/goal.ts
import { z as z12 } from "zod";
var createGoalSchema, updateGoalSchema;
var init_goal = __esm({
  "../packages/shared/src/validators/goal.ts"() {
    "use strict";
    init_constants();
    createGoalSchema = z12.object({
      title: z12.string().min(1),
      description: z12.string().optional().nullable(),
      level: z12.enum(GOAL_LEVELS).optional().default("task"),
      status: z12.enum(GOAL_STATUSES).optional().default("planned"),
      parentId: z12.string().uuid().optional().nullable(),
      ownerAgentId: z12.string().uuid().optional().nullable()
    });
    updateGoalSchema = createGoalSchema.partial();
  }
});

// ../packages/shared/src/validators/approval.ts
import { z as z13 } from "zod";
var createApprovalSchema, resolveApprovalSchema, requestApprovalRevisionSchema, resubmitApprovalSchema, addApprovalCommentSchema;
var init_approval = __esm({
  "../packages/shared/src/validators/approval.ts"() {
    "use strict";
    init_constants();
    createApprovalSchema = z13.object({
      type: z13.enum(APPROVAL_TYPES),
      requestedByAgentId: z13.string().uuid().optional().nullable(),
      payload: z13.record(z13.unknown()),
      issueIds: z13.array(z13.string().uuid()).optional()
    });
    resolveApprovalSchema = z13.object({
      decisionNote: z13.string().optional().nullable(),
      decidedByUserId: z13.string().optional().default("board")
    });
    requestApprovalRevisionSchema = z13.object({
      decisionNote: z13.string().optional().nullable(),
      decidedByUserId: z13.string().optional().default("board")
    });
    resubmitApprovalSchema = z13.object({
      payload: z13.record(z13.unknown()).optional()
    });
    addApprovalCommentSchema = z13.object({
      body: z13.string().min(1)
    });
  }
});

// ../packages/shared/src/validators/cost.ts
import { z as z14 } from "zod";
var createCostEventSchema, updateBudgetSchema;
var init_cost = __esm({
  "../packages/shared/src/validators/cost.ts"() {
    "use strict";
    init_constants();
    createCostEventSchema = z14.object({
      agentId: z14.string().uuid(),
      issueId: z14.string().uuid().optional().nullable(),
      projectId: z14.string().uuid().optional().nullable(),
      goalId: z14.string().uuid().optional().nullable(),
      heartbeatRunId: z14.string().uuid().optional().nullable(),
      billingCode: z14.string().optional().nullable(),
      provider: z14.string().min(1),
      biller: z14.string().min(1).optional(),
      billingType: z14.enum(BILLING_TYPES).optional().default("unknown"),
      model: z14.string().min(1),
      inputTokens: z14.number().int().nonnegative().optional().default(0),
      cachedInputTokens: z14.number().int().nonnegative().optional().default(0),
      outputTokens: z14.number().int().nonnegative().optional().default(0),
      costCents: z14.number().int().nonnegative(),
      occurredAt: z14.string().datetime()
    }).transform((value) => ({
      ...value,
      biller: value.biller ?? value.provider
    }));
    updateBudgetSchema = z14.object({
      budgetMonthlyCents: z14.number().int().nonnegative()
    });
  }
});

// ../packages/shared/src/validators/finance.ts
import { z as z15 } from "zod";
var createFinanceEventSchema;
var init_finance = __esm({
  "../packages/shared/src/validators/finance.ts"() {
    "use strict";
    init_constants();
    createFinanceEventSchema = z15.object({
      agentId: z15.string().uuid().optional().nullable(),
      issueId: z15.string().uuid().optional().nullable(),
      projectId: z15.string().uuid().optional().nullable(),
      goalId: z15.string().uuid().optional().nullable(),
      heartbeatRunId: z15.string().uuid().optional().nullable(),
      costEventId: z15.string().uuid().optional().nullable(),
      billingCode: z15.string().optional().nullable(),
      description: z15.string().max(500).optional().nullable(),
      eventKind: z15.enum(FINANCE_EVENT_KINDS),
      direction: z15.enum(FINANCE_DIRECTIONS).optional().default("debit"),
      biller: z15.string().min(1),
      provider: z15.string().min(1).optional().nullable(),
      executionAdapterType: z15.enum(AGENT_ADAPTER_TYPES).optional().nullable(),
      pricingTier: z15.string().min(1).optional().nullable(),
      region: z15.string().min(1).optional().nullable(),
      model: z15.string().min(1).optional().nullable(),
      quantity: z15.number().int().nonnegative().optional().nullable(),
      unit: z15.enum(FINANCE_UNITS).optional().nullable(),
      amountCents: z15.number().int().nonnegative(),
      currency: z15.string().length(3).optional().default("USD"),
      estimated: z15.boolean().optional().default(false),
      externalInvoiceId: z15.string().optional().nullable(),
      metadataJson: z15.record(z15.string(), z15.unknown()).optional().nullable(),
      occurredAt: z15.string().datetime()
    }).transform((value) => ({
      ...value,
      currency: value.currency.toUpperCase()
    }));
  }
});

// ../packages/shared/src/validators/asset.ts
import { z as z16 } from "zod";
var createAssetImageMetadataSchema;
var init_asset = __esm({
  "../packages/shared/src/validators/asset.ts"() {
    "use strict";
    createAssetImageMetadataSchema = z16.object({
      namespace: z16.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9/_-]+$/).optional()
    });
  }
});

// ../packages/shared/src/validators/access.ts
import { z as z17 } from "zod";
var createCompanyInviteSchema, createOpenClawInvitePromptSchema, acceptInviteSchema, listJoinRequestsQuerySchema, claimJoinRequestApiKeySchema, updateMemberPermissionsSchema, updateUserCompanyAccessSchema;
var init_access = __esm({
  "../packages/shared/src/validators/access.ts"() {
    "use strict";
    init_constants();
    createCompanyInviteSchema = z17.object({
      allowedJoinTypes: z17.enum(INVITE_JOIN_TYPES).default("both"),
      defaultsPayload: z17.record(z17.string(), z17.unknown()).optional().nullable(),
      agentMessage: z17.string().max(4e3).optional().nullable()
    });
    createOpenClawInvitePromptSchema = z17.object({
      agentMessage: z17.string().max(4e3).optional().nullable()
    });
    acceptInviteSchema = z17.object({
      requestType: z17.enum(JOIN_REQUEST_TYPES),
      agentName: z17.string().min(1).max(120).optional(),
      adapterType: z17.enum(AGENT_ADAPTER_TYPES).optional(),
      capabilities: z17.string().max(4e3).optional().nullable(),
      agentDefaultsPayload: z17.record(z17.string(), z17.unknown()).optional().nullable(),
      // OpenClaw join compatibility fields accepted at top level.
      responsesWebhookUrl: z17.string().max(4e3).optional().nullable(),
      responsesWebhookMethod: z17.string().max(32).optional().nullable(),
      responsesWebhookHeaders: z17.record(z17.string(), z17.unknown()).optional().nullable(),
      paperclipApiUrl: z17.string().max(4e3).optional().nullable(),
      webhookAuthHeader: z17.string().max(4e3).optional().nullable()
    });
    listJoinRequestsQuerySchema = z17.object({
      status: z17.enum(JOIN_REQUEST_STATUSES).optional(),
      requestType: z17.enum(JOIN_REQUEST_TYPES).optional()
    });
    claimJoinRequestApiKeySchema = z17.object({
      claimSecret: z17.string().min(16).max(256)
    });
    updateMemberPermissionsSchema = z17.object({
      grants: z17.array(
        z17.object({
          permissionKey: z17.enum(PERMISSION_KEYS),
          scope: z17.record(z17.string(), z17.unknown()).optional().nullable()
        })
      )
    });
    updateUserCompanyAccessSchema = z17.object({
      companyIds: z17.array(z17.string().uuid()).default([])
    });
  }
});

// ../packages/shared/src/validators/plugin.ts
import { z as z18 } from "zod";
function isValidCronExpression(expression) {
  const trimmed = expression.trim();
  if (!trimmed)
    return false;
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5)
    return false;
  return fields.every((f) => CRON_FIELD_PATTERN.test(f));
}
var jsonSchemaSchema, CRON_FIELD_PATTERN, pluginJobDeclarationSchema, pluginWebhookDeclarationSchema, pluginToolDeclarationSchema, pluginUiSlotDeclarationSchema, entityScopedLauncherPlacementZones, launcherBoundsByEnvironment, pluginLauncherActionDeclarationSchema, pluginLauncherRenderDeclarationSchema, pluginLauncherDeclarationSchema, pluginManifestV1Schema, installPluginSchema, upsertPluginConfigSchema, patchPluginConfigSchema, updatePluginStatusSchema, uninstallPluginSchema, pluginStateScopeKeySchema, setPluginStateSchema, listPluginStateSchema;
var init_plugin = __esm({
  "../packages/shared/src/validators/plugin.ts"() {
    "use strict";
    init_constants();
    jsonSchemaSchema = z18.record(z18.unknown()).refine(
      (val) => {
        if (Object.keys(val).length === 0)
          return true;
        return typeof val.type === "string" || val.$ref !== void 0 || val.oneOf !== void 0 || val.anyOf !== void 0 || val.allOf !== void 0;
      },
      { message: "Must be a valid JSON Schema object (requires at least a 'type', '$ref', or composition keyword)" }
    );
    CRON_FIELD_PATTERN = /^(\*(?:\/[0-9]+)?|[0-9]+(?:-[0-9]+)?(?:\/[0-9]+)?)(?:,(\*(?:\/[0-9]+)?|[0-9]+(?:-[0-9]+)?(?:\/[0-9]+)?))*$/;
    pluginJobDeclarationSchema = z18.object({
      jobKey: z18.string().min(1),
      displayName: z18.string().min(1),
      description: z18.string().optional(),
      schedule: z18.string().refine(
        (val) => isValidCronExpression(val),
        { message: "schedule must be a valid 5-field cron expression (e.g. '*/15 * * * *')" }
      ).optional()
    });
    pluginWebhookDeclarationSchema = z18.object({
      endpointKey: z18.string().min(1),
      displayName: z18.string().min(1),
      description: z18.string().optional()
    });
    pluginToolDeclarationSchema = z18.object({
      name: z18.string().min(1),
      displayName: z18.string().min(1),
      description: z18.string().min(1),
      parametersSchema: jsonSchemaSchema
    });
    pluginUiSlotDeclarationSchema = z18.object({
      type: z18.enum(PLUGIN_UI_SLOT_TYPES),
      id: z18.string().min(1),
      displayName: z18.string().min(1),
      exportName: z18.string().min(1),
      entityTypes: z18.array(z18.enum(PLUGIN_UI_SLOT_ENTITY_TYPES)).optional(),
      routePath: z18.string().regex(/^[a-z0-9][a-z0-9-]*$/, {
        message: "routePath must be a lowercase single-segment slug (letters, numbers, hyphens)"
      }).optional(),
      order: z18.number().int().optional()
    }).superRefine((value, ctx) => {
      const entityScopedTypes = ["detailTab", "taskDetailView", "contextMenuItem", "commentAnnotation", "commentContextMenuItem", "projectSidebarItem"];
      if (entityScopedTypes.includes(value.type) && (!value.entityTypes || value.entityTypes.length === 0)) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: `${value.type} slots require at least one entityType`,
          path: ["entityTypes"]
        });
      }
      if (value.type === "projectSidebarItem" && value.entityTypes && !value.entityTypes.includes("project")) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: 'projectSidebarItem slots require entityTypes to include "project"',
          path: ["entityTypes"]
        });
      }
      if (value.type === "commentAnnotation" && value.entityTypes && !value.entityTypes.includes("comment")) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: 'commentAnnotation slots require entityTypes to include "comment"',
          path: ["entityTypes"]
        });
      }
      if (value.type === "commentContextMenuItem" && value.entityTypes && !value.entityTypes.includes("comment")) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: 'commentContextMenuItem slots require entityTypes to include "comment"',
          path: ["entityTypes"]
        });
      }
      if (value.routePath && value.type !== "page") {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: "routePath is only supported for page slots",
          path: ["routePath"]
        });
      }
      if (value.routePath && PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS.includes(value.routePath)) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: `routePath "${value.routePath}" is reserved by the host`,
          path: ["routePath"]
        });
      }
    });
    entityScopedLauncherPlacementZones = [
      "detailTab",
      "taskDetailView",
      "contextMenuItem",
      "commentAnnotation",
      "commentContextMenuItem",
      "projectSidebarItem"
    ];
    launcherBoundsByEnvironment = {
      hostInline: ["inline", "compact", "default"],
      hostOverlay: ["compact", "default", "wide", "full"],
      hostRoute: ["default", "wide", "full"],
      external: [],
      iframe: ["compact", "default", "wide", "full"]
    };
    pluginLauncherActionDeclarationSchema = z18.object({
      type: z18.enum(PLUGIN_LAUNCHER_ACTIONS),
      target: z18.string().min(1),
      params: z18.record(z18.unknown()).optional()
    }).superRefine((value, ctx) => {
      if (value.type === "performAction" && value.target.includes("/")) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: "performAction launchers must target an action key, not a route or URL",
          path: ["target"]
        });
      }
      if (value.type === "navigate" && /^https?:\/\//.test(value.target)) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: "navigate launchers must target a host route, not an absolute URL",
          path: ["target"]
        });
      }
    });
    pluginLauncherRenderDeclarationSchema = z18.object({
      environment: z18.enum(PLUGIN_LAUNCHER_RENDER_ENVIRONMENTS),
      bounds: z18.enum(PLUGIN_LAUNCHER_BOUNDS).optional()
    }).superRefine((value, ctx) => {
      if (!value.bounds) {
        return;
      }
      const supportedBounds = launcherBoundsByEnvironment[value.environment];
      if (!supportedBounds.includes(value.bounds)) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: `bounds "${value.bounds}" is not supported for render environment "${value.environment}"`,
          path: ["bounds"]
        });
      }
    });
    pluginLauncherDeclarationSchema = z18.object({
      id: z18.string().min(1),
      displayName: z18.string().min(1),
      description: z18.string().optional(),
      placementZone: z18.enum(PLUGIN_LAUNCHER_PLACEMENT_ZONES),
      exportName: z18.string().min(1).optional(),
      entityTypes: z18.array(z18.enum(PLUGIN_UI_SLOT_ENTITY_TYPES)).optional(),
      order: z18.number().int().optional(),
      action: pluginLauncherActionDeclarationSchema,
      render: pluginLauncherRenderDeclarationSchema.optional()
    }).superRefine((value, ctx) => {
      if (entityScopedLauncherPlacementZones.some((zone) => zone === value.placementZone) && (!value.entityTypes || value.entityTypes.length === 0)) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: `${value.placementZone} launchers require at least one entityType`,
          path: ["entityTypes"]
        });
      }
      if (value.placementZone === "projectSidebarItem" && value.entityTypes && !value.entityTypes.includes("project")) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: 'projectSidebarItem launchers require entityTypes to include "project"',
          path: ["entityTypes"]
        });
      }
      if (value.action.type === "performAction" && value.render) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: "performAction launchers cannot declare render hints",
          path: ["render"]
        });
      }
      if (["openModal", "openDrawer", "openPopover"].includes(value.action.type) && !value.render) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: `${value.action.type} launchers require render metadata`,
          path: ["render"]
        });
      }
      if (value.action.type === "openModal" && value.render?.environment === "hostInline") {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: "openModal launchers cannot use the hostInline render environment",
          path: ["render", "environment"]
        });
      }
      if (value.action.type === "openDrawer" && value.render && !["hostOverlay", "iframe"].includes(value.render.environment)) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: "openDrawer launchers must use hostOverlay or iframe render environments",
          path: ["render", "environment"]
        });
      }
      if (value.action.type === "openPopover" && value.render?.environment === "hostRoute") {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: "openPopover launchers cannot use the hostRoute render environment",
          path: ["render", "environment"]
        });
      }
    });
    pluginManifestV1Schema = z18.object({
      id: z18.string().min(1).regex(
        /^[a-z0-9][a-z0-9._-]*$/,
        "Plugin id must start with a lowercase alphanumeric and contain only lowercase letters, digits, dots, hyphens, or underscores"
      ),
      apiVersion: z18.literal(1),
      version: z18.string().min(1).regex(
        /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
        "Version must follow semver (e.g. 1.0.0 or 1.0.0-beta.1)"
      ),
      displayName: z18.string().min(1).max(100),
      description: z18.string().min(1).max(500),
      author: z18.string().min(1).max(200),
      categories: z18.array(z18.enum(PLUGIN_CATEGORIES)).min(1),
      minimumHostVersion: z18.string().regex(
        /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
        "minimumHostVersion must follow semver (e.g. 1.0.0)"
      ).optional(),
      minimumPaperclipVersion: z18.string().regex(
        /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
        "minimumPaperclipVersion must follow semver (e.g. 1.0.0)"
      ).optional(),
      capabilities: z18.array(z18.enum(PLUGIN_CAPABILITIES)).min(1),
      entrypoints: z18.object({
        worker: z18.string().min(1),
        ui: z18.string().min(1).optional()
      }),
      instanceConfigSchema: jsonSchemaSchema.optional(),
      jobs: z18.array(pluginJobDeclarationSchema).optional(),
      webhooks: z18.array(pluginWebhookDeclarationSchema).optional(),
      tools: z18.array(pluginToolDeclarationSchema).optional(),
      launchers: z18.array(pluginLauncherDeclarationSchema).optional(),
      ui: z18.object({
        slots: z18.array(pluginUiSlotDeclarationSchema).min(1).optional(),
        launchers: z18.array(pluginLauncherDeclarationSchema).optional()
      }).optional()
    }).superRefine((manifest, ctx) => {
      const hasUiSlots = (manifest.ui?.slots?.length ?? 0) > 0;
      const hasUiLaunchers = (manifest.ui?.launchers?.length ?? 0) > 0;
      if ((hasUiSlots || hasUiLaunchers) && !manifest.entrypoints.ui) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: "entrypoints.ui is required when ui.slots or ui.launchers are declared",
          path: ["entrypoints", "ui"]
        });
      }
      if (manifest.minimumHostVersion && manifest.minimumPaperclipVersion && manifest.minimumHostVersion !== manifest.minimumPaperclipVersion) {
        ctx.addIssue({
          code: z18.ZodIssueCode.custom,
          message: "minimumHostVersion and minimumPaperclipVersion must match when both are declared",
          path: ["minimumHostVersion"]
        });
      }
      if (manifest.tools && manifest.tools.length > 0) {
        if (!manifest.capabilities.includes("agent.tools.register")) {
          ctx.addIssue({
            code: z18.ZodIssueCode.custom,
            message: "Capability 'agent.tools.register' is required when tools are declared",
            path: ["capabilities"]
          });
        }
      }
      if (manifest.jobs && manifest.jobs.length > 0) {
        if (!manifest.capabilities.includes("jobs.schedule")) {
          ctx.addIssue({
            code: z18.ZodIssueCode.custom,
            message: "Capability 'jobs.schedule' is required when jobs are declared",
            path: ["capabilities"]
          });
        }
      }
      if (manifest.webhooks && manifest.webhooks.length > 0) {
        if (!manifest.capabilities.includes("webhooks.receive")) {
          ctx.addIssue({
            code: z18.ZodIssueCode.custom,
            message: "Capability 'webhooks.receive' is required when webhooks are declared",
            path: ["capabilities"]
          });
        }
      }
      if (manifest.jobs) {
        const jobKeys = manifest.jobs.map((j) => j.jobKey);
        const duplicates = jobKeys.filter((key, i) => jobKeys.indexOf(key) !== i);
        if (duplicates.length > 0) {
          ctx.addIssue({
            code: z18.ZodIssueCode.custom,
            message: `Duplicate job keys: ${[...new Set(duplicates)].join(", ")}`,
            path: ["jobs"]
          });
        }
      }
      if (manifest.webhooks) {
        const endpointKeys = manifest.webhooks.map((w) => w.endpointKey);
        const duplicates = endpointKeys.filter((key, i) => endpointKeys.indexOf(key) !== i);
        if (duplicates.length > 0) {
          ctx.addIssue({
            code: z18.ZodIssueCode.custom,
            message: `Duplicate webhook endpoint keys: ${[...new Set(duplicates)].join(", ")}`,
            path: ["webhooks"]
          });
        }
      }
      if (manifest.tools) {
        const toolNames = manifest.tools.map((t) => t.name);
        const duplicates = toolNames.filter((name, i) => toolNames.indexOf(name) !== i);
        if (duplicates.length > 0) {
          ctx.addIssue({
            code: z18.ZodIssueCode.custom,
            message: `Duplicate tool names: ${[...new Set(duplicates)].join(", ")}`,
            path: ["tools"]
          });
        }
      }
      if (manifest.ui) {
        if (manifest.ui.slots) {
          const slotIds = manifest.ui.slots.map((s) => s.id);
          const duplicates = slotIds.filter((id, i) => slotIds.indexOf(id) !== i);
          if (duplicates.length > 0) {
            ctx.addIssue({
              code: z18.ZodIssueCode.custom,
              message: `Duplicate UI slot ids: ${[...new Set(duplicates)].join(", ")}`,
              path: ["ui", "slots"]
            });
          }
        }
      }
      const allLaunchers = [
        ...manifest.launchers ?? [],
        ...manifest.ui?.launchers ?? []
      ];
      if (allLaunchers.length > 0) {
        const launcherIds = allLaunchers.map((launcher) => launcher.id);
        const duplicates = launcherIds.filter((id, i) => launcherIds.indexOf(id) !== i);
        if (duplicates.length > 0) {
          ctx.addIssue({
            code: z18.ZodIssueCode.custom,
            message: `Duplicate launcher ids: ${[...new Set(duplicates)].join(", ")}`,
            path: manifest.ui?.launchers ? ["ui", "launchers"] : ["launchers"]
          });
        }
      }
    });
    installPluginSchema = z18.object({
      packageName: z18.string().min(1),
      version: z18.string().min(1).optional(),
      /** Set by loader for local-path installs so the worker can be resolved. */
      packagePath: z18.string().min(1).optional()
    });
    upsertPluginConfigSchema = z18.object({
      configJson: z18.record(z18.unknown())
    });
    patchPluginConfigSchema = z18.object({
      configJson: z18.record(z18.unknown())
    });
    updatePluginStatusSchema = z18.object({
      status: z18.enum(PLUGIN_STATUSES),
      lastError: z18.string().nullable().optional()
    });
    uninstallPluginSchema = z18.object({
      removeData: z18.boolean().optional().default(false)
    });
    pluginStateScopeKeySchema = z18.object({
      scopeKind: z18.enum(PLUGIN_STATE_SCOPE_KINDS),
      scopeId: z18.string().min(1).optional(),
      namespace: z18.string().min(1).optional(),
      stateKey: z18.string().min(1)
    });
    setPluginStateSchema = z18.object({
      scopeKind: z18.enum(PLUGIN_STATE_SCOPE_KINDS),
      scopeId: z18.string().min(1).optional(),
      namespace: z18.string().min(1).optional(),
      stateKey: z18.string().min(1),
      /** JSON-serializable value to store. */
      value: z18.unknown()
    });
    listPluginStateSchema = z18.object({
      scopeKind: z18.enum(PLUGIN_STATE_SCOPE_KINDS).optional(),
      scopeId: z18.string().min(1).optional(),
      namespace: z18.string().min(1).optional()
    });
  }
});

// ../packages/shared/src/validators/index.ts
var init_validators = __esm({
  "../packages/shared/src/validators/index.ts"() {
    "use strict";
    init_instance();
    init_budget();
    init_company();
    init_company_portability();
    init_agent();
    init_project();
    init_issue();
    init_work_product();
    init_execution_workspace();
    init_ticket();
    init_goal();
    init_approval();
    init_secret();
    init_cost();
    init_finance();
    init_asset();
    init_access();
    init_plugin();
  }
});

// ../packages/shared/src/api.ts
var API_PREFIX, API;
var init_api = __esm({
  "../packages/shared/src/api.ts"() {
    "use strict";
    API_PREFIX = "/api";
    API = {
      health: `${API_PREFIX}/health`,
      companies: `${API_PREFIX}/companies`,
      agents: `${API_PREFIX}/agents`,
      projects: `${API_PREFIX}/projects`,
      issues: `${API_PREFIX}/issues`,
      goals: `${API_PREFIX}/goals`,
      approvals: `${API_PREFIX}/approvals`,
      secrets: `${API_PREFIX}/secrets`,
      costs: `${API_PREFIX}/costs`,
      activity: `${API_PREFIX}/activity`,
      dashboard: `${API_PREFIX}/dashboard`,
      sidebarBadges: `${API_PREFIX}/sidebar-badges`,
      invites: `${API_PREFIX}/invites`,
      joinRequests: `${API_PREFIX}/join-requests`,
      members: `${API_PREFIX}/members`,
      admin: `${API_PREFIX}/admin`
    };
  }
});

// ../packages/shared/src/agent-url-key.ts
var init_agent_url_key = __esm({
  "../packages/shared/src/agent-url-key.ts"() {
    "use strict";
  }
});

// ../packages/shared/src/project-url-key.ts
var init_project_url_key = __esm({
  "../packages/shared/src/project-url-key.ts"() {
    "use strict";
  }
});

// ../packages/shared/src/project-mentions.ts
var init_project_mentions = __esm({
  "../packages/shared/src/project-mentions.ts"() {
    "use strict";
  }
});

// ../packages/shared/src/config-schema.ts
import { z as z19 } from "zod";
var configMetaSchema, llmConfigSchema, databaseBackupConfigSchema, databaseConfigSchema, loggingConfigSchema, serverConfigSchema, authConfigSchema, surfaceConfigSchema, storageLocalDiskConfigSchema, storageS3ConfigSchema, storageConfigSchema, secretsLocalEncryptedConfigSchema, secretsConfigSchema, paperclipConfigSchema;
var init_config_schema = __esm({
  "../packages/shared/src/config-schema.ts"() {
    "use strict";
    init_constants();
    configMetaSchema = z19.object({
      version: z19.literal(1),
      updatedAt: z19.string(),
      source: z19.enum(["onboard", "configure", "doctor"])
    });
    llmConfigSchema = z19.object({
      provider: z19.enum(["claude", "openai"]),
      apiKey: z19.string().optional()
    });
    databaseBackupConfigSchema = z19.object({
      enabled: z19.boolean().default(true),
      intervalMinutes: z19.number().int().min(1).max(7 * 24 * 60).default(60),
      retentionDays: z19.number().int().min(1).max(3650).default(30),
      dir: z19.string().default("~/.paperclip/instances/default/data/backups")
    });
    databaseConfigSchema = z19.object({
      mode: z19.enum(["embedded-postgres", "postgres"]).default("embedded-postgres"),
      connectionString: z19.string().optional(),
      embeddedPostgresDataDir: z19.string().default("~/.paperclip/instances/default/db"),
      embeddedPostgresPort: z19.number().int().min(1).max(65535).default(54329),
      backup: databaseBackupConfigSchema.default({
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 30,
        dir: "~/.paperclip/instances/default/data/backups"
      })
    });
    loggingConfigSchema = z19.object({
      mode: z19.enum(["file", "cloud"]),
      logDir: z19.string().default("~/.paperclip/instances/default/logs")
    });
    serverConfigSchema = z19.object({
      deploymentMode: z19.enum(DEPLOYMENT_MODES).default("local_trusted"),
      exposure: z19.enum(DEPLOYMENT_EXPOSURES).default("private"),
      host: z19.string().default("127.0.0.1"),
      port: z19.number().int().min(1).max(65535).default(3100),
      allowedHostnames: z19.array(z19.string().min(1)).default([]),
      serveUi: z19.boolean().default(true)
    });
    authConfigSchema = z19.object({
      baseUrlMode: z19.enum(AUTH_BASE_URL_MODES).default("auto"),
      publicBaseUrl: z19.string().url().optional(),
      disableSignUp: z19.boolean().default(false),
      token: z19.string().optional(),
      growthubBaseUrl: z19.string().url().optional(),
      growthubPortalBaseUrl: z19.string().url().optional(),
      growthubMachineLabel: z19.string().optional(),
      growthubWorkspaceLabel: z19.string().optional()
    });
    surfaceConfigSchema = z19.object({
      profile: z19.enum(SURFACE_PROFILES).default("dx")
    });
    storageLocalDiskConfigSchema = z19.object({
      baseDir: z19.string().default("~/.paperclip/instances/default/data/storage")
    });
    storageS3ConfigSchema = z19.object({
      bucket: z19.string().min(1).default("paperclip"),
      region: z19.string().min(1).default("us-east-1"),
      endpoint: z19.string().optional(),
      prefix: z19.string().default(""),
      forcePathStyle: z19.boolean().default(false)
    });
    storageConfigSchema = z19.object({
      provider: z19.enum(STORAGE_PROVIDERS).default("local_disk"),
      localDisk: storageLocalDiskConfigSchema.default({
        baseDir: "~/.paperclip/instances/default/data/storage"
      }),
      s3: storageS3ConfigSchema.default({
        bucket: "paperclip",
        region: "us-east-1",
        prefix: "",
        forcePathStyle: false
      })
    });
    secretsLocalEncryptedConfigSchema = z19.object({
      keyFilePath: z19.string().default("~/.paperclip/instances/default/secrets/master.key")
    });
    secretsConfigSchema = z19.object({
      provider: z19.enum(SECRET_PROVIDERS).default("local_encrypted"),
      strictMode: z19.boolean().default(false),
      localEncrypted: secretsLocalEncryptedConfigSchema.default({
        keyFilePath: "~/.paperclip/instances/default/secrets/master.key"
      })
    });
    paperclipConfigSchema = z19.object({
      $meta: configMetaSchema,
      llm: llmConfigSchema.optional(),
      database: databaseConfigSchema,
      logging: loggingConfigSchema,
      server: serverConfigSchema,
      auth: authConfigSchema.default({
        baseUrlMode: "auto",
        disableSignUp: false
      }),
      surface: surfaceConfigSchema.default({
        profile: "dx"
      }),
      storage: storageConfigSchema.default({
        provider: "local_disk",
        localDisk: {
          baseDir: "~/.paperclip/instances/default/data/storage"
        },
        s3: {
          bucket: "paperclip",
          region: "us-east-1",
          prefix: "",
          forcePathStyle: false
        }
      }),
      secrets: secretsConfigSchema.default({
        provider: "local_encrypted",
        strictMode: false,
        localEncrypted: {
          keyFilePath: "~/.paperclip/instances/default/secrets/master.key"
        }
      })
    }).superRefine((value, ctx) => {
      if (value.server.deploymentMode === "local_trusted") {
        if (value.server.exposure !== "private") {
          ctx.addIssue({
            code: z19.ZodIssueCode.custom,
            message: "server.exposure must be private when deploymentMode is local_trusted",
            path: ["server", "exposure"]
          });
        }
        return;
      }
      if (value.auth.baseUrlMode === "explicit" && !value.auth.publicBaseUrl) {
        ctx.addIssue({
          code: z19.ZodIssueCode.custom,
          message: "auth.publicBaseUrl is required when auth.baseUrlMode is explicit",
          path: ["auth", "publicBaseUrl"]
        });
      }
      if (value.server.exposure === "public" && value.auth.baseUrlMode !== "explicit") {
        ctx.addIssue({
          code: z19.ZodIssueCode.custom,
          message: "auth.baseUrlMode must be explicit when deploymentMode=authenticated and exposure=public",
          path: ["auth", "baseUrlMode"]
        });
      }
      if (value.server.exposure === "public" && !value.auth.publicBaseUrl) {
        ctx.addIssue({
          code: z19.ZodIssueCode.custom,
          message: "auth.publicBaseUrl is required when deploymentMode=authenticated and exposure=public",
          path: ["auth", "publicBaseUrl"]
        });
      }
    });
  }
});

// ../packages/shared/src/surface-runtime.ts
function buildSurfaceRuntimeContract(profile = "dx") {
  if (profile === "gtm") {
    return Object.freeze({
      profile: "gtm",
      mounts: Object.freeze({
        routes: "/gtm",
        cli: "gtm"
      }),
      capabilities: Object.freeze({
        dxEnabled: false,
        gtmEnabled: true
      })
    });
  }
  return Object.freeze({
    profile: "dx",
    mounts: Object.freeze({
      routes: "/dx",
      cli: "dx"
    }),
    capabilities: Object.freeze({
      dxEnabled: true,
      gtmEnabled: false
    })
  });
}
function initializeSurfaceRuntimeContract(profile = "dx") {
  if (runtimeContract && runtimeContract.profile === profile)
    return runtimeContract;
  runtimeContract = buildSurfaceRuntimeContract(profile);
  return runtimeContract;
}
var runtimeContract;
var init_surface_runtime = __esm({
  "../packages/shared/src/surface-runtime.ts"() {
    "use strict";
    runtimeContract = null;
  }
});

// ../packages/shared/src/agent-surface-metadata.ts
var init_agent_surface_metadata = __esm({
  "../packages/shared/src/agent-surface-metadata.ts"() {
    "use strict";
  }
});

// ../packages/shared/src/gtm.ts
function humanizeToken(value) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (match) => match.toUpperCase());
}
function mapGtmKnowledgeKind(sourceType) {
  return sourceType === "table" ? "table" : "item";
}
function formatConnectorLabel(type) {
  if (!type?.trim())
    return "Manual";
  return humanizeToken(type);
}
function formatKnowledgeGroupLabel(table) {
  return humanizeToken(table.fileName);
}
function createDefaultGtmState(now = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    profile: {
      growthubAccountEmail: null,
      workspaceName: "Workspace",
      ghAppPath: null,
      workspaceId: null,
      adminId: null
    },
    knowledge: {
      table: {
        id: "workspace-knowledge-table",
        agentSlug: "__user_general",
        compressed: false,
        createdAt: now,
        fileName: "workspace_knowledge",
        isActive: true,
        itemCount: 0,
        metadata: {
          origin: "table",
          notes: "No workspace knowledge has been imported yet."
        },
        sourceType: "table",
        storagePath: "knowledge/tables/workspace_knowledge.txt",
        updatedAt: now,
        userId: "local-user"
      },
      items: []
    },
    connectors: [],
    workflow: {
      id: "local-sdr",
      label: "Local SDR",
      runnerPath: null,
      referenceInterfaces: {
        internalSocialsPath: null,
        localSdrPath: null
      },
      lastRun: {
        command: null,
        error: null,
        finishedAt: null,
        pid: null,
        startedAt: null,
        status: "idle"
      }
    }
  };
}
function coerceGtmState(raw) {
  const fallback = createDefaultGtmState();
  if (!raw || typeof raw !== "object")
    return fallback;
  const candidate = raw;
  const fallbackItemTemplate = fallback.knowledge.table;
  const fallbackConnectorTemplate = fallback.connectors[0] ?? {
    id: "gtm-connector",
    label: "Connector",
    target: "Configure workspace and connector settings",
    status: "needs_attention",
    config: {
      workspaceId: null,
      adminId: null
    }
  };
  return {
    profile: {
      ...fallback.profile,
      ...candidate.profile
    },
    knowledge: {
      table: {
        ...fallback.knowledge.table,
        ...candidate.knowledge?.table,
        metadata: {
          ...fallback.knowledge.table.metadata,
          ...candidate.knowledge?.table?.metadata
        }
      },
      items: Array.isArray(candidate.knowledge?.items) && candidate.knowledge.items.length > 0 ? candidate.knowledge.items.map((item, index51) => ({
        ...fallbackItemTemplate,
        ...item,
        metadata: {
          ...fallbackItemTemplate.metadata,
          ...item.metadata
        }
      })) : fallback.knowledge.items
    },
    connectors: Array.isArray(candidate.connectors) && candidate.connectors.length > 0 ? candidate.connectors.map((connector, index51) => ({
      ...fallbackConnectorTemplate,
      ...connector,
      config: {
        ...fallbackConnectorTemplate.config,
        ...connector.config
      }
    })) : fallback.connectors,
    workflow: {
      ...fallback.workflow,
      ...candidate.workflow,
      referenceInterfaces: {
        ...fallback.workflow.referenceInterfaces,
        ...candidate.workflow?.referenceInterfaces
      },
      lastRun: {
        ...fallback.workflow.lastRun,
        ...candidate.workflow?.lastRun
      }
    }
  };
}
function toGtmViewModel(state) {
  const workflowRun = state.workflow.lastRun;
  return {
    profile: {
      account: state.profile.growthubAccountEmail ?? "Not connected",
      workspace: state.profile.workspaceName ?? "Workspace",
      appConnection: state.profile.ghAppPath ?? "App not configured"
    },
    knowledge: {
      group: {
        label: formatKnowledgeGroupLabel(state.knowledge.table),
        connector: formatConnectorLabel(state.knowledge.table.metadata.connector_type),
        notes: state.knowledge.table.metadata.notes ?? null,
        itemCount: state.knowledge.items.length
      },
      items: state.knowledge.items.map((item) => ({
        title: item.fileName,
        kind: mapGtmKnowledgeKind(item.sourceType),
        notes: item.metadata.notes ?? null
      }))
    },
    connectors: state.connectors.map((connector) => ({
      label: connector.label,
      target: connector.target,
      status: connector.status === "connected" ? "Connected" : "Needs attention",
      summary: connector.config.workspaceId ? `Workspace ${connector.config.workspaceId}` : "Connector requires configuration"
    })),
    workflow: {
      label: state.workflow.label,
      runner: state.workflow.runnerPath ?? "No local runner configured",
      status: !state.workflow.runnerPath ? "Needs setup" : workflowRun.status === "running" ? "Running" : workflowRun.status === "failed" ? "Needs attention" : "Ready",
      lastRunAt: workflowRun.startedAt ?? "Not started",
      actionLabel: state.workflow.runnerPath ? "Launch Local SDR" : "Configure Local SDR",
      interfaces: [
        state.workflow.referenceInterfaces.internalSocialsPath ?? "Reference app not configured",
        state.workflow.referenceInterfaces.localSdrPath ?? "Workflow runner not configured"
      ]
    }
  };
}
var init_gtm = __esm({
  "../packages/shared/src/gtm.ts"() {
    "use strict";
  }
});

// ../packages/shared/src/growthub-query-engine.ts
var init_growthub_query_engine = __esm({
  "../packages/shared/src/growthub-query-engine.ts"() {
    "use strict";
  }
});

// ../packages/shared/src/kb-skill-bundle/types.ts
var init_types = __esm({
  "../packages/shared/src/kb-skill-bundle/types.ts"() {
    "use strict";
  }
});

// ../packages/shared/src/kb-skill-bundle/metadata.ts
var init_metadata = __esm({
  "../packages/shared/src/kb-skill-bundle/metadata.ts"() {
    "use strict";
  }
});

// ../packages/shared/src/kb-skill-bundle/bundle.ts
var init_bundle = __esm({
  "../packages/shared/src/kb-skill-bundle/bundle.ts"() {
    "use strict";
    init_types();
  }
});

// ../packages/shared/src/kb-skill-bundle/prompt.ts
var init_prompt = __esm({
  "../packages/shared/src/kb-skill-bundle/prompt.ts"() {
    "use strict";
    init_bundle();
  }
});

// ../packages/shared/src/kb-skill-bundle/index.ts
var init_kb_skill_bundle = __esm({
  "../packages/shared/src/kb-skill-bundle/index.ts"() {
    "use strict";
    init_types();
    init_metadata();
    init_bundle();
    init_prompt();
  }
});

// ../packages/shared/src/index.ts
var init_src = __esm({
  "../packages/shared/src/index.ts"() {
    "use strict";
    init_constants();
    init_validators();
    init_validators();
    init_api();
    init_agent_url_key();
    init_project_url_key();
    init_project_mentions();
    init_config_schema();
    init_surface_runtime();
    init_ticket_stages();
    init_agent_surface_metadata();
    init_gtm();
    init_growthub_query_engine();
    init_kb_skill_bundle();
  }
});

// src/config/schema.ts
var init_schema = __esm({
  "src/config/schema.ts"() {
    "use strict";
    init_src();
  }
});

// src/config/home.ts
import os from "node:os";
import path from "node:path";
function resolvePaperclipHomeDir() {
  const envHome = process.env.PAPERCLIP_HOME?.trim();
  if (envHome)
    return path.resolve(expandHomePrefix(envHome));
  return path.resolve(os.homedir(), ".paperclip");
}
function resolvePaperclipInstanceId(override) {
  const raw = override?.trim() || process.env.PAPERCLIP_INSTANCE_ID?.trim() || DEFAULT_INSTANCE_ID;
  if (!INSTANCE_ID_RE.test(raw)) {
    throw new Error(
      `Invalid instance id '${raw}'. Allowed characters: letters, numbers, '_' and '-'.`
    );
  }
  return raw;
}
function resolvePaperclipInstanceRoot(instanceId) {
  const id = resolvePaperclipInstanceId(instanceId);
  return path.resolve(resolvePaperclipHomeDir(), "instances", id);
}
function resolveDefaultConfigPath(instanceId) {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "config.json");
}
function resolveDefaultContextPath() {
  return path.resolve(resolvePaperclipHomeDir(), "context.json");
}
function resolveDefaultEmbeddedPostgresDir(instanceId) {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "db");
}
function resolveDefaultLogsDir(instanceId) {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "logs");
}
function resolveDefaultSecretsKeyFilePath(instanceId) {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "secrets", "master.key");
}
function resolveDefaultStorageDir(instanceId) {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "data", "storage");
}
function resolveDefaultBackupDir(instanceId) {
  return path.resolve(resolvePaperclipInstanceRoot(instanceId), "data", "backups");
}
function expandHomePrefix(value) {
  if (value === "~")
    return os.homedir();
  if (value.startsWith("~/"))
    return path.resolve(os.homedir(), value.slice(2));
  return value;
}
function describeLocalInstancePaths(instanceId) {
  const resolvedInstanceId = resolvePaperclipInstanceId(instanceId);
  const instanceRoot = resolvePaperclipInstanceRoot(resolvedInstanceId);
  return {
    homeDir: resolvePaperclipHomeDir(),
    instanceId: resolvedInstanceId,
    instanceRoot,
    configPath: resolveDefaultConfigPath(resolvedInstanceId),
    embeddedPostgresDataDir: resolveDefaultEmbeddedPostgresDir(resolvedInstanceId),
    backupDir: resolveDefaultBackupDir(resolvedInstanceId),
    logDir: resolveDefaultLogsDir(resolvedInstanceId),
    secretsKeyFilePath: resolveDefaultSecretsKeyFilePath(resolvedInstanceId),
    storageDir: resolveDefaultStorageDir(resolvedInstanceId)
  };
}
var DEFAULT_INSTANCE_ID, INSTANCE_ID_RE;
var init_home = __esm({
  "src/config/home.ts"() {
    "use strict";
    DEFAULT_INSTANCE_ID = "default";
    INSTANCE_ID_RE = /^[a-zA-Z0-9_-]+$/;
  }
});

// src/config/store.ts
import fs from "node:fs";
import path2 from "node:path";
function findConfigFileFromAncestors(startDir) {
  const absoluteStartDir = path2.resolve(startDir);
  let currentDir = absoluteStartDir;
  while (true) {
    const candidate = path2.resolve(currentDir, ".paperclip", DEFAULT_CONFIG_BASENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const nextDir = path2.resolve(currentDir, "..");
    if (nextDir === currentDir)
      break;
    currentDir = nextDir;
  }
  return null;
}
function resolveConfigPath(overridePath) {
  if (overridePath)
    return path2.resolve(overridePath);
  if (process.env.PAPERCLIP_CONFIG)
    return path2.resolve(process.env.PAPERCLIP_CONFIG);
  return findConfigFileFromAncestors(process.cwd()) ?? resolveDefaultConfigPath(resolvePaperclipInstanceId());
}
function parseJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function migrateLegacyConfig(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return raw;
  const config = { ...raw };
  const databaseRaw = config.database;
  if (typeof databaseRaw !== "object" || databaseRaw === null || Array.isArray(databaseRaw)) {
    return config;
  }
  const database = { ...databaseRaw };
  if (database.mode === "pglite") {
    database.mode = "embedded-postgres";
    if (typeof database.embeddedPostgresDataDir !== "string" && typeof database.pgliteDataDir === "string") {
      database.embeddedPostgresDataDir = database.pgliteDataDir;
    }
    if (typeof database.embeddedPostgresPort !== "number" && typeof database.pglitePort === "number" && Number.isFinite(database.pglitePort)) {
      database.embeddedPostgresPort = database.pglitePort;
    }
  }
  config.database = database;
  return config;
}
function formatValidationError(err) {
  const issues2 = err?.issues;
  if (Array.isArray(issues2) && issues2.length > 0) {
    return issues2.map((issue) => {
      const pathParts = Array.isArray(issue.path) ? issue.path.map(String) : [];
      const issuePath = pathParts.length > 0 ? pathParts.join(".") : "config";
      const message = typeof issue.message === "string" ? issue.message : "Invalid value";
      return `${issuePath}: ${message}`;
    }).join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}
function readConfig(configPath) {
  const filePath = resolveConfigPath(configPath);
  if (!fs.existsSync(filePath))
    return null;
  const raw = parseJson(filePath);
  const migrated = migrateLegacyConfig(raw);
  const parsed = paperclipConfigSchema.safeParse(migrated);
  if (!parsed.success) {
    throw new Error(`Invalid config at ${filePath}: ${formatValidationError(parsed.error)}`);
  }
  return parsed.data;
}
function writeConfig(config, configPath) {
  const filePath = resolveConfigPath(configPath);
  const dir = path2.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(filePath)) {
    const backupPath = filePath + ".backup";
    fs.copyFileSync(filePath, backupPath);
    fs.chmodSync(backupPath, 384);
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", {
    mode: 384
  });
}
function configExists(configPath) {
  return fs.existsSync(resolveConfigPath(configPath));
}
var DEFAULT_CONFIG_BASENAME;
var init_store = __esm({
  "src/config/store.ts"() {
    "use strict";
    init_schema();
    init_home();
    DEFAULT_CONFIG_BASENAME = "config.json";
  }
});

// src/config/env.ts
import fs2 from "node:fs";
import path3 from "node:path";
import { randomBytes } from "node:crypto";
import { config as loadDotenv, parse as parseEnvFileContents } from "dotenv";
function resolveEnvFilePath(configPath) {
  return path3.resolve(path3.dirname(resolveConfigPath(configPath)), ".env");
}
function isNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function parseEnvFile(contents) {
  try {
    return parseEnvFileContents(contents);
  } catch {
    return {};
  }
}
function formatEnvValue(value) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}
function renderEnvFile(entries) {
  const lines = [
    "# Paperclip environment variables",
    "# Generated by Paperclip CLI commands",
    ...Object.entries(entries).map(([key, value]) => `${key}=${formatEnvValue(value)}`),
    ""
  ];
  return lines.join("\n");
}
function resolvePaperclipEnvFile(configPath) {
  return resolveEnvFilePath(configPath);
}
function resolveAgentJwtEnvFile(configPath) {
  return resolveEnvFilePath(configPath);
}
function loadPaperclipEnvFile(configPath) {
  loadAgentJwtEnvFile(resolveEnvFilePath(configPath));
}
function loadAgentJwtEnvFile(filePath = resolveEnvFilePath()) {
  if (loadedEnvFiles.has(filePath))
    return;
  if (!fs2.existsSync(filePath))
    return;
  loadedEnvFiles.add(filePath);
  loadDotenv({ path: filePath, override: false, quiet: true });
}
function readAgentJwtSecretFromEnv(configPath) {
  loadAgentJwtEnvFile(resolveEnvFilePath(configPath));
  const raw = process.env[JWT_SECRET_ENV_KEY];
  return isNonEmpty(raw) ? raw.trim() : null;
}
function readAgentJwtSecretFromEnvFile(filePath = resolveEnvFilePath()) {
  if (!fs2.existsSync(filePath))
    return null;
  const raw = fs2.readFileSync(filePath, "utf-8");
  const values = parseEnvFile(raw);
  const value = values[JWT_SECRET_ENV_KEY];
  return isNonEmpty(value) ? value.trim() : null;
}
function ensureAgentJwtSecret(configPath) {
  const existingEnv = readAgentJwtSecretFromEnv(configPath);
  if (existingEnv) {
    return { secret: existingEnv, created: false };
  }
  const envFilePath = resolveEnvFilePath(configPath);
  const existingFile = readAgentJwtSecretFromEnvFile(envFilePath);
  const secret = existingFile ?? randomBytes(32).toString("hex");
  const created = !existingFile;
  if (!existingFile) {
    writeAgentJwtEnv(secret, envFilePath);
  }
  return { secret, created };
}
function writeAgentJwtEnv(secret, filePath = resolveEnvFilePath()) {
  mergePaperclipEnvEntries({ [JWT_SECRET_ENV_KEY]: secret }, filePath);
}
function readPaperclipEnvEntries(filePath = resolveEnvFilePath()) {
  if (!fs2.existsSync(filePath))
    return {};
  return parseEnvFile(fs2.readFileSync(filePath, "utf-8"));
}
function writePaperclipEnvEntries(entries, filePath = resolveEnvFilePath()) {
  const dir = path3.dirname(filePath);
  fs2.mkdirSync(dir, { recursive: true });
  fs2.writeFileSync(filePath, renderEnvFile(entries), {
    mode: 384
  });
}
function mergePaperclipEnvEntries(entries, filePath = resolveEnvFilePath()) {
  const current = readPaperclipEnvEntries(filePath);
  const next = {
    ...current,
    ...Object.fromEntries(
      Object.entries(entries).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    )
  };
  writePaperclipEnvEntries(next, filePath);
  return next;
}
var JWT_SECRET_ENV_KEY, loadedEnvFiles;
var init_env = __esm({
  "src/config/env.ts"() {
    "use strict";
    init_store();
    JWT_SECRET_ENV_KEY = "PAPERCLIP_AGENT_JWT_SECRET";
    loadedEnvFiles = /* @__PURE__ */ new Set();
  }
});

// src/utils/path-resolver.ts
import fs3 from "node:fs";
import path4 from "node:path";
function unique(items) {
  return Array.from(new Set(items));
}
function resolveRuntimeLikePath(value, configPath) {
  const expanded = expandHomePrefix(value);
  if (path4.isAbsolute(expanded))
    return path4.resolve(expanded);
  const cwd = process.cwd();
  const configDir = configPath ? path4.dirname(configPath) : null;
  const workspaceRoot = configDir ? path4.resolve(configDir, "..") : cwd;
  const candidates = unique([
    ...configDir ? [path4.resolve(configDir, expanded)] : [],
    path4.resolve(workspaceRoot, "server", expanded),
    path4.resolve(workspaceRoot, expanded),
    path4.resolve(cwd, expanded)
  ]);
  return candidates.find((candidate) => fs3.existsSync(candidate)) ?? candidates[0];
}
var init_path_resolver = __esm({
  "src/utils/path-resolver.ts"() {
    "use strict";
    init_home();
  }
});

// src/config/secrets-key.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import fs4 from "node:fs";
import path5 from "node:path";
function ensureLocalSecretsKeyFile(config, configPath) {
  if (config.secrets.provider !== "local_encrypted") {
    return { status: "skipped_provider", path: null };
  }
  const envMasterKey = process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  if (envMasterKey && envMasterKey.trim().length > 0) {
    return { status: "skipped_env", path: null };
  }
  const keyFileOverride = process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
  const configuredPath = keyFileOverride && keyFileOverride.trim().length > 0 ? keyFileOverride.trim() : config.secrets.localEncrypted.keyFilePath;
  const keyFilePath = resolveRuntimeLikePath(configuredPath, configPath);
  if (fs4.existsSync(keyFilePath)) {
    return { status: "existing", path: keyFilePath };
  }
  fs4.mkdirSync(path5.dirname(keyFilePath), { recursive: true });
  fs4.writeFileSync(keyFilePath, randomBytes2(32).toString("base64"), {
    encoding: "utf8",
    mode: 384
  });
  try {
    fs4.chmodSync(keyFilePath, 384);
  } catch {
  }
  return { status: "created", path: keyFilePath };
}
var init_secrets_key = __esm({
  "src/config/secrets-key.ts"() {
    "use strict";
    init_path_resolver();
  }
});

// src/prompts/database.ts
import * as p from "@clack/prompts";
async function promptDatabase(current) {
  const instanceId = resolvePaperclipInstanceId();
  const defaultEmbeddedDir = resolveDefaultEmbeddedPostgresDir(instanceId);
  const defaultBackupDir = resolveDefaultBackupDir(instanceId);
  const base = current ?? {
    mode: "embedded-postgres",
    embeddedPostgresDataDir: defaultEmbeddedDir,
    embeddedPostgresPort: 54329,
    backup: {
      enabled: true,
      intervalMinutes: 60,
      retentionDays: 30,
      dir: defaultBackupDir
    }
  };
  const mode = await p.select({
    message: "Database mode",
    options: [
      { value: "embedded-postgres", label: "Embedded PostgreSQL (managed locally)", hint: "recommended" },
      { value: "postgres", label: "PostgreSQL (external server)" }
    ],
    initialValue: base.mode
  });
  if (p.isCancel(mode)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  let connectionString = base.connectionString;
  let embeddedPostgresDataDir = base.embeddedPostgresDataDir || defaultEmbeddedDir;
  let embeddedPostgresPort = base.embeddedPostgresPort || 54329;
  if (mode === "postgres") {
    const value = await p.text({
      message: "PostgreSQL connection string",
      defaultValue: base.connectionString ?? "",
      placeholder: "postgres://user:pass@localhost:5432/paperclip",
      validate: (val) => {
        if (!val)
          return "Connection string is required for PostgreSQL mode";
        if (!val.startsWith("postgres"))
          return "Must be a postgres:// or postgresql:// URL";
      }
    });
    if (p.isCancel(value)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    connectionString = value;
  } else {
    const dataDir = await p.text({
      message: "Embedded PostgreSQL data directory",
      defaultValue: base.embeddedPostgresDataDir || defaultEmbeddedDir,
      placeholder: defaultEmbeddedDir
    });
    if (p.isCancel(dataDir)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    embeddedPostgresDataDir = dataDir || defaultEmbeddedDir;
    const portValue = await p.text({
      message: "Embedded PostgreSQL port",
      defaultValue: String(base.embeddedPostgresPort || 54329),
      placeholder: "54329",
      validate: (val) => {
        const n = Number(val);
        if (!Number.isInteger(n) || n < 1 || n > 65535)
          return "Port must be an integer between 1 and 65535";
      }
    });
    if (p.isCancel(portValue)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    embeddedPostgresPort = Number(portValue || "54329");
    connectionString = void 0;
  }
  const backupEnabled = await p.confirm({
    message: "Enable automatic database backups?",
    initialValue: base.backup.enabled
  });
  if (p.isCancel(backupEnabled)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  const backupDirInput = await p.text({
    message: "Backup directory",
    defaultValue: base.backup.dir || defaultBackupDir,
    placeholder: defaultBackupDir,
    validate: (val) => !val || val.trim().length === 0 ? "Backup directory is required" : void 0
  });
  if (p.isCancel(backupDirInput)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  const backupIntervalInput = await p.text({
    message: "Backup interval (minutes)",
    defaultValue: String(base.backup.intervalMinutes || 60),
    placeholder: "60",
    validate: (val) => {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1)
        return "Interval must be a positive integer";
      if (n > 10080)
        return "Interval must be 10080 minutes (7 days) or less";
      return void 0;
    }
  });
  if (p.isCancel(backupIntervalInput)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  const backupRetentionInput = await p.text({
    message: "Backup retention (days)",
    defaultValue: String(base.backup.retentionDays || 30),
    placeholder: "30",
    validate: (val) => {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1)
        return "Retention must be a positive integer";
      if (n > 3650)
        return "Retention must be 3650 days or less";
      return void 0;
    }
  });
  if (p.isCancel(backupRetentionInput)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return {
    mode,
    connectionString,
    embeddedPostgresDataDir,
    embeddedPostgresPort,
    backup: {
      enabled: backupEnabled,
      intervalMinutes: Number(backupIntervalInput || "60"),
      retentionDays: Number(backupRetentionInput || "30"),
      dir: backupDirInput || defaultBackupDir
    }
  };
}
var init_database = __esm({
  "src/prompts/database.ts"() {
    "use strict";
    init_home();
  }
});

// src/prompts/llm.ts
import * as p2 from "@clack/prompts";
async function promptLlm() {
  const configureLlm = await p2.confirm({
    message: "Configure an LLM provider now?",
    initialValue: false
  });
  if (p2.isCancel(configureLlm)) {
    p2.cancel("Setup cancelled.");
    process.exit(0);
  }
  if (!configureLlm)
    return void 0;
  const provider = await p2.select({
    message: "LLM provider",
    options: [
      { value: "claude", label: "Claude (Anthropic)" },
      { value: "openai", label: "OpenAI" }
    ]
  });
  if (p2.isCancel(provider)) {
    p2.cancel("Setup cancelled.");
    process.exit(0);
  }
  const apiKey = await p2.password({
    message: `${provider === "claude" ? "Anthropic" : "OpenAI"} API key`,
    validate: (val) => {
      if (!val)
        return "API key is required";
    }
  });
  if (p2.isCancel(apiKey)) {
    p2.cancel("Setup cancelled.");
    process.exit(0);
  }
  return { provider, apiKey };
}
var init_llm = __esm({
  "src/prompts/llm.ts"() {
    "use strict";
  }
});

// src/prompts/logging.ts
import * as p3 from "@clack/prompts";
async function promptLogging() {
  const defaultLogDir = resolveDefaultLogsDir(resolvePaperclipInstanceId());
  const mode = await p3.select({
    message: "Logging mode",
    options: [
      { value: "file", label: "File-based logging", hint: "recommended" },
      { value: "cloud", label: "Cloud logging", hint: "coming soon" }
    ]
  });
  if (p3.isCancel(mode)) {
    p3.cancel("Setup cancelled.");
    process.exit(0);
  }
  if (mode === "file") {
    const logDir = await p3.text({
      message: "Log directory",
      defaultValue: defaultLogDir,
      placeholder: defaultLogDir
    });
    if (p3.isCancel(logDir)) {
      p3.cancel("Setup cancelled.");
      process.exit(0);
    }
    return { mode: "file", logDir: logDir || defaultLogDir };
  }
  p3.note("Cloud logging is coming soon. Using file-based logging for now.");
  return { mode: "file", logDir: defaultLogDir };
}
var init_logging = __esm({
  "src/prompts/logging.ts"() {
    "use strict";
    init_home();
  }
});

// src/prompts/secrets.ts
import * as p4 from "@clack/prompts";
function defaultKeyFilePath() {
  return resolveDefaultSecretsKeyFilePath(resolvePaperclipInstanceId());
}
function defaultSecretsConfig() {
  const keyFilePath = defaultKeyFilePath();
  return {
    provider: "local_encrypted",
    strictMode: false,
    localEncrypted: {
      keyFilePath
    }
  };
}
async function promptSecrets(current) {
  const base = current ?? defaultSecretsConfig();
  const provider = await p4.select({
    message: "Secrets provider",
    options: [
      {
        value: "local_encrypted",
        label: "Local encrypted (recommended)",
        hint: "best for single-developer installs"
      },
      {
        value: "aws_secrets_manager",
        label: "AWS Secrets Manager",
        hint: "requires external adapter integration"
      },
      {
        value: "gcp_secret_manager",
        label: "GCP Secret Manager",
        hint: "requires external adapter integration"
      },
      {
        value: "vault",
        label: "HashiCorp Vault",
        hint: "requires external adapter integration"
      }
    ],
    initialValue: base.provider
  });
  if (p4.isCancel(provider)) {
    p4.cancel("Setup cancelled.");
    process.exit(0);
  }
  const strictMode = await p4.confirm({
    message: "Require secret refs for sensitive env vars?",
    initialValue: base.strictMode
  });
  if (p4.isCancel(strictMode)) {
    p4.cancel("Setup cancelled.");
    process.exit(0);
  }
  const fallbackDefault = defaultKeyFilePath();
  let keyFilePath = base.localEncrypted.keyFilePath || fallbackDefault;
  if (provider === "local_encrypted") {
    const keyPath = await p4.text({
      message: "Local encrypted key file path",
      defaultValue: keyFilePath,
      placeholder: fallbackDefault,
      validate: (value) => {
        if (!value || value.trim().length === 0)
          return "Key file path is required";
      }
    });
    if (p4.isCancel(keyPath)) {
      p4.cancel("Setup cancelled.");
      process.exit(0);
    }
    keyFilePath = keyPath.trim();
  }
  if (provider !== "local_encrypted") {
    p4.note(
      `${provider} is not fully wired in this build yet. Keep local_encrypted unless you are actively implementing that adapter.`,
      "Heads up"
    );
  }
  return {
    provider,
    strictMode,
    localEncrypted: {
      keyFilePath
    }
  };
}
var init_secrets = __esm({
  "src/prompts/secrets.ts"() {
    "use strict";
    init_home();
  }
});

// src/prompts/storage.ts
import * as p5 from "@clack/prompts";
function defaultStorageBaseDir() {
  return resolveDefaultStorageDir(resolvePaperclipInstanceId());
}
function defaultStorageConfig() {
  return {
    provider: "local_disk",
    localDisk: {
      baseDir: defaultStorageBaseDir()
    },
    s3: {
      bucket: "paperclip",
      region: "us-east-1",
      endpoint: void 0,
      prefix: "",
      forcePathStyle: false
    }
  };
}
async function promptStorage(current) {
  const base = current ?? defaultStorageConfig();
  const provider = await p5.select({
    message: "Storage provider",
    options: [
      {
        value: "local_disk",
        label: "Local disk (recommended)",
        hint: "best for single-user local deployments"
      },
      {
        value: "s3",
        label: "S3 compatible",
        hint: "for cloud/object storage backends"
      }
    ],
    initialValue: base.provider
  });
  if (p5.isCancel(provider)) {
    p5.cancel("Setup cancelled.");
    process.exit(0);
  }
  if (provider === "local_disk") {
    const baseDir = await p5.text({
      message: "Local storage base directory",
      defaultValue: base.localDisk.baseDir || defaultStorageBaseDir(),
      placeholder: defaultStorageBaseDir(),
      validate: (value) => {
        if (!value || value.trim().length === 0)
          return "Storage base directory is required";
      }
    });
    if (p5.isCancel(baseDir)) {
      p5.cancel("Setup cancelled.");
      process.exit(0);
    }
    return {
      provider: "local_disk",
      localDisk: {
        baseDir: baseDir.trim()
      },
      s3: base.s3
    };
  }
  const bucket = await p5.text({
    message: "S3 bucket",
    defaultValue: base.s3.bucket || "paperclip",
    placeholder: "paperclip",
    validate: (value) => {
      if (!value || value.trim().length === 0)
        return "Bucket is required";
    }
  });
  if (p5.isCancel(bucket)) {
    p5.cancel("Setup cancelled.");
    process.exit(0);
  }
  const region = await p5.text({
    message: "S3 region",
    defaultValue: base.s3.region || "us-east-1",
    placeholder: "us-east-1",
    validate: (value) => {
      if (!value || value.trim().length === 0)
        return "Region is required";
    }
  });
  if (p5.isCancel(region)) {
    p5.cancel("Setup cancelled.");
    process.exit(0);
  }
  const endpoint = await p5.text({
    message: "S3 endpoint (optional for compatible backends)",
    defaultValue: base.s3.endpoint ?? "",
    placeholder: "https://s3.amazonaws.com"
  });
  if (p5.isCancel(endpoint)) {
    p5.cancel("Setup cancelled.");
    process.exit(0);
  }
  const prefix = await p5.text({
    message: "Object key prefix (optional)",
    defaultValue: base.s3.prefix ?? "",
    placeholder: "paperclip/"
  });
  if (p5.isCancel(prefix)) {
    p5.cancel("Setup cancelled.");
    process.exit(0);
  }
  const forcePathStyle = await p5.confirm({
    message: "Use S3 path-style URLs?",
    initialValue: base.s3.forcePathStyle ?? false
  });
  if (p5.isCancel(forcePathStyle)) {
    p5.cancel("Setup cancelled.");
    process.exit(0);
  }
  return {
    provider: "s3",
    localDisk: base.localDisk,
    s3: {
      bucket: bucket.trim(),
      region: region.trim(),
      endpoint: endpoint.trim() || void 0,
      prefix: prefix.trim(),
      forcePathStyle
    }
  };
}
var init_storage = __esm({
  "src/prompts/storage.ts"() {
    "use strict";
    init_home();
  }
});

// src/config/hostnames.ts
function normalizeHostnameInput(raw) {
  const input = raw.trim();
  if (!input) {
    throw new Error("Hostname is required");
  }
  try {
    const url = input.includes("://") ? new URL(input) : new URL(`http://${input}`);
    const hostname = url.hostname.trim().toLowerCase();
    if (!hostname)
      throw new Error("Hostname is required");
    return hostname;
  } catch {
    throw new Error(`Invalid hostname: ${raw}`);
  }
}
function parseHostnameCsv(raw) {
  if (!raw.trim())
    return [];
  const unique3 = /* @__PURE__ */ new Set();
  for (const part of raw.split(",")) {
    const hostname = normalizeHostnameInput(part);
    unique3.add(hostname);
  }
  return Array.from(unique3);
}
var init_hostnames = __esm({
  "src/config/hostnames.ts"() {
    "use strict";
  }
});

// src/prompts/server.ts
import * as p6 from "@clack/prompts";
async function promptServer(opts) {
  const currentServer = opts?.currentServer;
  const currentAuth = opts?.currentAuth;
  const deploymentModeSelection = await p6.select({
    message: "Deployment mode",
    options: [
      {
        value: "local_trusted",
        label: "Local trusted",
        hint: "Easiest for local setup (no login, localhost-only)"
      },
      {
        value: "authenticated",
        label: "Authenticated",
        hint: "Login required; use for private network or public hosting"
      }
    ],
    initialValue: currentServer?.deploymentMode ?? "local_trusted"
  });
  if (p6.isCancel(deploymentModeSelection)) {
    p6.cancel("Setup cancelled.");
    process.exit(0);
  }
  const deploymentMode = deploymentModeSelection;
  let exposure = "private";
  if (deploymentMode === "authenticated") {
    const exposureSelection = await p6.select({
      message: "Exposure profile",
      options: [
        {
          value: "private",
          label: "Private network",
          hint: "Private access (for example Tailscale), lower setup friction"
        },
        {
          value: "public",
          label: "Public internet",
          hint: "Internet-facing deployment with stricter requirements"
        }
      ],
      initialValue: currentServer?.exposure ?? "private"
    });
    if (p6.isCancel(exposureSelection)) {
      p6.cancel("Setup cancelled.");
      process.exit(0);
    }
    exposure = exposureSelection;
  }
  const hostDefault = deploymentMode === "local_trusted" ? "127.0.0.1" : "0.0.0.0";
  const hostStr = await p6.text({
    message: "Bind host",
    defaultValue: currentServer?.host ?? hostDefault,
    placeholder: hostDefault,
    validate: (val) => {
      if (!val.trim())
        return "Host is required";
    }
  });
  if (p6.isCancel(hostStr)) {
    p6.cancel("Setup cancelled.");
    process.exit(0);
  }
  const portStr = await p6.text({
    message: "Server port",
    defaultValue: String(currentServer?.port ?? 3100),
    placeholder: "3100",
    validate: (val) => {
      const n = Number(val);
      if (isNaN(n) || n < 1 || n > 65535 || !Number.isInteger(n)) {
        return "Must be an integer between 1 and 65535";
      }
    }
  });
  if (p6.isCancel(portStr)) {
    p6.cancel("Setup cancelled.");
    process.exit(0);
  }
  let allowedHostnames = [];
  if (deploymentMode === "authenticated" && exposure === "private") {
    const allowedHostnamesInput = await p6.text({
      message: "Allowed hostnames (comma-separated, optional)",
      defaultValue: (currentServer?.allowedHostnames ?? []).join(", "),
      placeholder: "dotta-macbook-pro, your-host.tailnet.ts.net",
      validate: (val) => {
        try {
          parseHostnameCsv(val);
          return;
        } catch (err) {
          return err instanceof Error ? err.message : "Invalid hostname list";
        }
      }
    });
    if (p6.isCancel(allowedHostnamesInput)) {
      p6.cancel("Setup cancelled.");
      process.exit(0);
    }
    allowedHostnames = parseHostnameCsv(allowedHostnamesInput);
  }
  const port = Number(portStr) || 3100;
  let auth = { baseUrlMode: "auto", disableSignUp: false };
  if (deploymentMode === "authenticated" && exposure === "public") {
    const urlInput = await p6.text({
      message: "Public base URL",
      defaultValue: currentAuth?.publicBaseUrl ?? "",
      placeholder: "https://paperclip.example.com",
      validate: (val) => {
        const candidate = val.trim();
        if (!candidate)
          return "Public base URL is required for public exposure";
        try {
          const url = new URL(candidate);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            return "URL must start with http:// or https://";
          }
          return;
        } catch {
          return "Enter a valid URL";
        }
      }
    });
    if (p6.isCancel(urlInput)) {
      p6.cancel("Setup cancelled.");
      process.exit(0);
    }
    auth = {
      baseUrlMode: "explicit",
      disableSignUp: false,
      publicBaseUrl: urlInput.trim().replace(/\/+$/, "")
    };
  } else if (currentAuth?.baseUrlMode === "explicit" && currentAuth.publicBaseUrl) {
    auth = {
      baseUrlMode: "explicit",
      disableSignUp: false,
      publicBaseUrl: currentAuth.publicBaseUrl
    };
  }
  return {
    server: {
      deploymentMode,
      exposure,
      host: hostStr.trim(),
      port,
      allowedHostnames,
      serveUi: currentServer?.serveUi ?? true
    },
    auth
  };
}
var init_server = __esm({
  "src/prompts/server.ts"() {
    "use strict";
    init_hostnames();
  }
});

// ../packages/db/src/schema/companies.ts
import { pgTable, uuid, text as text6, integer, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
var companies;
var init_companies = __esm({
  "../packages/db/src/schema/companies.ts"() {
    "use strict";
    companies = pgTable(
      "companies",
      {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text6("name").notNull(),
        description: text6("description"),
        status: text6("status").notNull().default("active"),
        pauseReason: text6("pause_reason"),
        pausedAt: timestamp("paused_at", { withTimezone: true }),
        issuePrefix: text6("issue_prefix").notNull().default("PAP"),
        issueCounter: integer("issue_counter").notNull().default(0),
        budgetMonthlyCents: integer("budget_monthly_cents").notNull().default(0),
        spentMonthlyCents: integer("spent_monthly_cents").notNull().default(0),
        requireBoardApprovalForNewAgents: boolean("require_board_approval_for_new_agents").notNull().default(true),
        brandColor: text6("brand_color"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        issuePrefixUniqueIdx: uniqueIndex("companies_issue_prefix_idx").on(table.issuePrefix)
      })
    );
  }
});

// ../packages/db/src/schema/agents.ts
import {
  pgTable as pgTable2,
  uuid as uuid2,
  text as text7,
  integer as integer2,
  timestamp as timestamp2,
  jsonb,
  index
} from "drizzle-orm/pg-core";
var agents;
var init_agents = __esm({
  "../packages/db/src/schema/agents.ts"() {
    "use strict";
    init_companies();
    agents = pgTable2(
      "agents",
      {
        id: uuid2("id").primaryKey().defaultRandom(),
        companyId: uuid2("company_id").notNull().references(() => companies.id),
        name: text7("name").notNull(),
        role: text7("role").notNull().default("general"),
        title: text7("title"),
        icon: text7("icon"),
        status: text7("status").notNull().default("idle"),
        reportsTo: uuid2("reports_to").references(() => agents.id),
        capabilities: text7("capabilities"),
        adapterType: text7("adapter_type").notNull().default("process"),
        adapterConfig: jsonb("adapter_config").$type().notNull().default({}),
        runtimeConfig: jsonb("runtime_config").$type().notNull().default({}),
        budgetMonthlyCents: integer2("budget_monthly_cents").notNull().default(0),
        spentMonthlyCents: integer2("spent_monthly_cents").notNull().default(0),
        pauseReason: text7("pause_reason"),
        pausedAt: timestamp2("paused_at", { withTimezone: true }),
        permissions: jsonb("permissions").$type().notNull().default({}),
        lastHeartbeatAt: timestamp2("last_heartbeat_at", { withTimezone: true }),
        metadata: jsonb("metadata").$type(),
        createdAt: timestamp2("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp2("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyStatusIdx: index("agents_company_status_idx").on(table.companyId, table.status),
        companyReportsToIdx: index("agents_company_reports_to_idx").on(table.companyId, table.reportsTo)
      })
    );
  }
});

// ../packages/db/src/schema/assets.ts
import { pgTable as pgTable3, uuid as uuid3, text as text8, integer as integer3, timestamp as timestamp3, index as index2, uniqueIndex as uniqueIndex2 } from "drizzle-orm/pg-core";
var assets;
var init_assets = __esm({
  "../packages/db/src/schema/assets.ts"() {
    "use strict";
    init_companies();
    init_agents();
    assets = pgTable3(
      "assets",
      {
        id: uuid3("id").primaryKey().defaultRandom(),
        companyId: uuid3("company_id").notNull().references(() => companies.id),
        provider: text8("provider").notNull(),
        objectKey: text8("object_key").notNull(),
        contentType: text8("content_type").notNull(),
        byteSize: integer3("byte_size").notNull(),
        sha256: text8("sha256").notNull(),
        originalFilename: text8("original_filename"),
        createdByAgentId: uuid3("created_by_agent_id").references(() => agents.id),
        createdByUserId: text8("created_by_user_id"),
        createdAt: timestamp3("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp3("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyCreatedIdx: index2("assets_company_created_idx").on(table.companyId, table.createdAt),
        companyProviderIdx: index2("assets_company_provider_idx").on(table.companyId, table.provider),
        companyObjectKeyUq: uniqueIndex2("assets_company_object_key_uq").on(table.companyId, table.objectKey)
      })
    );
  }
});

// ../packages/db/src/schema/company_logos.ts
import { pgTable as pgTable4, uuid as uuid4, timestamp as timestamp4, uniqueIndex as uniqueIndex3 } from "drizzle-orm/pg-core";
var companyLogos;
var init_company_logos = __esm({
  "../packages/db/src/schema/company_logos.ts"() {
    "use strict";
    init_companies();
    init_assets();
    companyLogos = pgTable4(
      "company_logos",
      {
        id: uuid4("id").primaryKey().defaultRandom(),
        companyId: uuid4("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
        assetId: uuid4("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
        createdAt: timestamp4("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp4("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyUq: uniqueIndex3("company_logos_company_uq").on(table.companyId),
        assetUq: uniqueIndex3("company_logos_asset_uq").on(table.assetId)
      })
    );
  }
});

// ../packages/db/src/schema/auth.ts
import { pgTable as pgTable5, text as text9, timestamp as timestamp5, boolean as boolean2 } from "drizzle-orm/pg-core";
var authUsers, authSessions, authAccounts, authVerifications;
var init_auth = __esm({
  "../packages/db/src/schema/auth.ts"() {
    "use strict";
    authUsers = pgTable5("user", {
      id: text9("id").primaryKey(),
      name: text9("name").notNull(),
      email: text9("email").notNull(),
      emailVerified: boolean2("email_verified").notNull().default(false),
      image: text9("image"),
      createdAt: timestamp5("created_at", { withTimezone: true }).notNull(),
      updatedAt: timestamp5("updated_at", { withTimezone: true }).notNull()
    });
    authSessions = pgTable5("session", {
      id: text9("id").primaryKey(),
      expiresAt: timestamp5("expires_at", { withTimezone: true }).notNull(),
      token: text9("token").notNull(),
      createdAt: timestamp5("created_at", { withTimezone: true }).notNull(),
      updatedAt: timestamp5("updated_at", { withTimezone: true }).notNull(),
      ipAddress: text9("ip_address"),
      userAgent: text9("user_agent"),
      userId: text9("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" })
    });
    authAccounts = pgTable5("account", {
      id: text9("id").primaryKey(),
      accountId: text9("account_id").notNull(),
      providerId: text9("provider_id").notNull(),
      userId: text9("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
      accessToken: text9("access_token"),
      refreshToken: text9("refresh_token"),
      idToken: text9("id_token"),
      accessTokenExpiresAt: timestamp5("access_token_expires_at", { withTimezone: true }),
      refreshTokenExpiresAt: timestamp5("refresh_token_expires_at", { withTimezone: true }),
      scope: text9("scope"),
      password: text9("password"),
      createdAt: timestamp5("created_at", { withTimezone: true }).notNull(),
      updatedAt: timestamp5("updated_at", { withTimezone: true }).notNull()
    });
    authVerifications = pgTable5("verification", {
      id: text9("id").primaryKey(),
      identifier: text9("identifier").notNull(),
      value: text9("value").notNull(),
      expiresAt: timestamp5("expires_at", { withTimezone: true }).notNull(),
      createdAt: timestamp5("created_at", { withTimezone: true }),
      updatedAt: timestamp5("updated_at", { withTimezone: true })
    });
  }
});

// ../packages/db/src/schema/instance_settings.ts
import { pgTable as pgTable6, uuid as uuid5, text as text10, timestamp as timestamp6, jsonb as jsonb2, uniqueIndex as uniqueIndex4 } from "drizzle-orm/pg-core";
var instanceSettings;
var init_instance_settings = __esm({
  "../packages/db/src/schema/instance_settings.ts"() {
    "use strict";
    instanceSettings = pgTable6(
      "instance_settings",
      {
        id: uuid5("id").primaryKey().defaultRandom(),
        singletonKey: text10("singleton_key").notNull().default("default"),
        experimental: jsonb2("experimental").$type().notNull().default({}),
        createdAt: timestamp6("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp6("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        singletonKeyIdx: uniqueIndex4("instance_settings_singleton_key_idx").on(table.singletonKey)
      })
    );
  }
});

// ../packages/db/src/schema/instance_user_roles.ts
import { pgTable as pgTable7, uuid as uuid6, text as text11, timestamp as timestamp7, uniqueIndex as uniqueIndex5, index as index3 } from "drizzle-orm/pg-core";
var instanceUserRoles;
var init_instance_user_roles = __esm({
  "../packages/db/src/schema/instance_user_roles.ts"() {
    "use strict";
    instanceUserRoles = pgTable7(
      "instance_user_roles",
      {
        id: uuid6("id").primaryKey().defaultRandom(),
        userId: text11("user_id").notNull(),
        role: text11("role").notNull().default("instance_admin"),
        createdAt: timestamp7("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp7("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        userRoleUniqueIdx: uniqueIndex5("instance_user_roles_user_role_unique_idx").on(table.userId, table.role),
        roleIdx: index3("instance_user_roles_role_idx").on(table.role)
      })
    );
  }
});

// ../packages/db/src/schema/company_memberships.ts
import { pgTable as pgTable8, uuid as uuid7, text as text12, timestamp as timestamp8, uniqueIndex as uniqueIndex6, index as index4 } from "drizzle-orm/pg-core";
var companyMemberships;
var init_company_memberships = __esm({
  "../packages/db/src/schema/company_memberships.ts"() {
    "use strict";
    init_companies();
    companyMemberships = pgTable8(
      "company_memberships",
      {
        id: uuid7("id").primaryKey().defaultRandom(),
        companyId: uuid7("company_id").notNull().references(() => companies.id),
        principalType: text12("principal_type").notNull(),
        principalId: text12("principal_id").notNull(),
        status: text12("status").notNull().default("active"),
        membershipRole: text12("membership_role"),
        createdAt: timestamp8("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp8("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyPrincipalUniqueIdx: uniqueIndex6("company_memberships_company_principal_unique_idx").on(
          table.companyId,
          table.principalType,
          table.principalId
        ),
        principalStatusIdx: index4("company_memberships_principal_status_idx").on(
          table.principalType,
          table.principalId,
          table.status
        ),
        companyStatusIdx: index4("company_memberships_company_status_idx").on(table.companyId, table.status)
      })
    );
  }
});

// ../packages/db/src/schema/principal_permission_grants.ts
import { pgTable as pgTable9, uuid as uuid8, text as text13, timestamp as timestamp9, jsonb as jsonb3, uniqueIndex as uniqueIndex7, index as index5 } from "drizzle-orm/pg-core";
var principalPermissionGrants;
var init_principal_permission_grants = __esm({
  "../packages/db/src/schema/principal_permission_grants.ts"() {
    "use strict";
    init_companies();
    principalPermissionGrants = pgTable9(
      "principal_permission_grants",
      {
        id: uuid8("id").primaryKey().defaultRandom(),
        companyId: uuid8("company_id").notNull().references(() => companies.id),
        principalType: text13("principal_type").notNull(),
        principalId: text13("principal_id").notNull(),
        permissionKey: text13("permission_key").notNull(),
        scope: jsonb3("scope").$type(),
        grantedByUserId: text13("granted_by_user_id"),
        createdAt: timestamp9("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp9("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        uniqueGrantIdx: uniqueIndex7("principal_permission_grants_unique_idx").on(
          table.companyId,
          table.principalType,
          table.principalId,
          table.permissionKey
        ),
        companyPermissionIdx: index5("principal_permission_grants_company_permission_idx").on(
          table.companyId,
          table.permissionKey
        )
      })
    );
  }
});

// ../packages/db/src/schema/invites.ts
import { pgTable as pgTable10, uuid as uuid9, text as text14, timestamp as timestamp10, jsonb as jsonb4, index as index6, uniqueIndex as uniqueIndex8 } from "drizzle-orm/pg-core";
var invites;
var init_invites = __esm({
  "../packages/db/src/schema/invites.ts"() {
    "use strict";
    init_companies();
    invites = pgTable10(
      "invites",
      {
        id: uuid9("id").primaryKey().defaultRandom(),
        companyId: uuid9("company_id").references(() => companies.id),
        inviteType: text14("invite_type").notNull().default("company_join"),
        tokenHash: text14("token_hash").notNull(),
        allowedJoinTypes: text14("allowed_join_types").notNull().default("both"),
        defaultsPayload: jsonb4("defaults_payload").$type(),
        expiresAt: timestamp10("expires_at", { withTimezone: true }).notNull(),
        invitedByUserId: text14("invited_by_user_id"),
        revokedAt: timestamp10("revoked_at", { withTimezone: true }),
        acceptedAt: timestamp10("accepted_at", { withTimezone: true }),
        createdAt: timestamp10("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp10("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        tokenHashUniqueIdx: uniqueIndex8("invites_token_hash_unique_idx").on(table.tokenHash),
        companyInviteStateIdx: index6("invites_company_invite_state_idx").on(
          table.companyId,
          table.inviteType,
          table.revokedAt,
          table.expiresAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/join_requests.ts
import { pgTable as pgTable11, uuid as uuid10, text as text15, timestamp as timestamp11, jsonb as jsonb5, index as index7, uniqueIndex as uniqueIndex9 } from "drizzle-orm/pg-core";
var joinRequests;
var init_join_requests = __esm({
  "../packages/db/src/schema/join_requests.ts"() {
    "use strict";
    init_companies();
    init_invites();
    init_agents();
    joinRequests = pgTable11(
      "join_requests",
      {
        id: uuid10("id").primaryKey().defaultRandom(),
        inviteId: uuid10("invite_id").notNull().references(() => invites.id),
        companyId: uuid10("company_id").notNull().references(() => companies.id),
        requestType: text15("request_type").notNull(),
        status: text15("status").notNull().default("pending_approval"),
        requestIp: text15("request_ip").notNull(),
        requestingUserId: text15("requesting_user_id"),
        requestEmailSnapshot: text15("request_email_snapshot"),
        agentName: text15("agent_name"),
        adapterType: text15("adapter_type"),
        capabilities: text15("capabilities"),
        agentDefaultsPayload: jsonb5("agent_defaults_payload").$type(),
        claimSecretHash: text15("claim_secret_hash"),
        claimSecretExpiresAt: timestamp11("claim_secret_expires_at", { withTimezone: true }),
        claimSecretConsumedAt: timestamp11("claim_secret_consumed_at", { withTimezone: true }),
        createdAgentId: uuid10("created_agent_id").references(() => agents.id),
        approvedByUserId: text15("approved_by_user_id"),
        approvedAt: timestamp11("approved_at", { withTimezone: true }),
        rejectedByUserId: text15("rejected_by_user_id"),
        rejectedAt: timestamp11("rejected_at", { withTimezone: true }),
        createdAt: timestamp11("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp11("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        inviteUniqueIdx: uniqueIndex9("join_requests_invite_unique_idx").on(table.inviteId),
        companyStatusTypeCreatedIdx: index7("join_requests_company_status_type_created_idx").on(
          table.companyId,
          table.status,
          table.requestType,
          table.createdAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/budget_policies.ts
import { boolean as boolean3, index as index8, integer as integer4, pgTable as pgTable12, text as text16, timestamp as timestamp12, uuid as uuid11, uniqueIndex as uniqueIndex10 } from "drizzle-orm/pg-core";
var budgetPolicies;
var init_budget_policies = __esm({
  "../packages/db/src/schema/budget_policies.ts"() {
    "use strict";
    init_companies();
    budgetPolicies = pgTable12(
      "budget_policies",
      {
        id: uuid11("id").primaryKey().defaultRandom(),
        companyId: uuid11("company_id").notNull().references(() => companies.id),
        scopeType: text16("scope_type").notNull(),
        scopeId: uuid11("scope_id").notNull(),
        metric: text16("metric").notNull().default("billed_cents"),
        windowKind: text16("window_kind").notNull(),
        amount: integer4("amount").notNull().default(0),
        warnPercent: integer4("warn_percent").notNull().default(80),
        hardStopEnabled: boolean3("hard_stop_enabled").notNull().default(true),
        notifyEnabled: boolean3("notify_enabled").notNull().default(true),
        isActive: boolean3("is_active").notNull().default(true),
        createdByUserId: text16("created_by_user_id"),
        updatedByUserId: text16("updated_by_user_id"),
        createdAt: timestamp12("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp12("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyScopeActiveIdx: index8("budget_policies_company_scope_active_idx").on(
          table.companyId,
          table.scopeType,
          table.scopeId,
          table.isActive
        ),
        companyWindowIdx: index8("budget_policies_company_window_idx").on(
          table.companyId,
          table.windowKind,
          table.metric
        ),
        companyScopeMetricUniqueIdx: uniqueIndex10("budget_policies_company_scope_metric_unique_idx").on(
          table.companyId,
          table.scopeType,
          table.scopeId,
          table.metric,
          table.windowKind
        )
      })
    );
  }
});

// ../packages/db/src/schema/approvals.ts
import { pgTable as pgTable13, uuid as uuid12, text as text17, timestamp as timestamp13, jsonb as jsonb6, index as index9 } from "drizzle-orm/pg-core";
var approvals;
var init_approvals = __esm({
  "../packages/db/src/schema/approvals.ts"() {
    "use strict";
    init_companies();
    init_agents();
    approvals = pgTable13(
      "approvals",
      {
        id: uuid12("id").primaryKey().defaultRandom(),
        companyId: uuid12("company_id").notNull().references(() => companies.id),
        type: text17("type").notNull(),
        requestedByAgentId: uuid12("requested_by_agent_id").references(() => agents.id),
        requestedByUserId: text17("requested_by_user_id"),
        status: text17("status").notNull().default("pending"),
        payload: jsonb6("payload").$type().notNull(),
        decisionNote: text17("decision_note"),
        decidedByUserId: text17("decided_by_user_id"),
        decidedAt: timestamp13("decided_at", { withTimezone: true }),
        createdAt: timestamp13("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp13("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyStatusTypeIdx: index9("approvals_company_status_type_idx").on(
          table.companyId,
          table.status,
          table.type
        )
      })
    );
  }
});

// ../packages/db/src/schema/budget_incidents.ts
import { sql } from "drizzle-orm";
import { index as index10, integer as integer5, pgTable as pgTable14, text as text18, timestamp as timestamp14, uuid as uuid13, uniqueIndex as uniqueIndex11 } from "drizzle-orm/pg-core";
var budgetIncidents;
var init_budget_incidents = __esm({
  "../packages/db/src/schema/budget_incidents.ts"() {
    "use strict";
    init_approvals();
    init_budget_policies();
    init_companies();
    budgetIncidents = pgTable14(
      "budget_incidents",
      {
        id: uuid13("id").primaryKey().defaultRandom(),
        companyId: uuid13("company_id").notNull().references(() => companies.id),
        policyId: uuid13("policy_id").notNull().references(() => budgetPolicies.id),
        scopeType: text18("scope_type").notNull(),
        scopeId: uuid13("scope_id").notNull(),
        metric: text18("metric").notNull(),
        windowKind: text18("window_kind").notNull(),
        windowStart: timestamp14("window_start", { withTimezone: true }).notNull(),
        windowEnd: timestamp14("window_end", { withTimezone: true }).notNull(),
        thresholdType: text18("threshold_type").notNull(),
        amountLimit: integer5("amount_limit").notNull(),
        amountObserved: integer5("amount_observed").notNull(),
        status: text18("status").notNull().default("open"),
        approvalId: uuid13("approval_id").references(() => approvals.id),
        resolvedAt: timestamp14("resolved_at", { withTimezone: true }),
        createdAt: timestamp14("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp14("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyStatusIdx: index10("budget_incidents_company_status_idx").on(table.companyId, table.status),
        companyScopeIdx: index10("budget_incidents_company_scope_idx").on(
          table.companyId,
          table.scopeType,
          table.scopeId,
          table.status
        ),
        policyWindowIdx: uniqueIndex11("budget_incidents_policy_window_threshold_idx").on(
          table.policyId,
          table.windowStart,
          table.thresholdType
        ).where(sql`${table.status} <> 'dismissed'`)
      })
    );
  }
});

// ../packages/db/src/schema/agent_config_revisions.ts
import { pgTable as pgTable15, uuid as uuid14, text as text19, timestamp as timestamp15, jsonb as jsonb7, index as index11 } from "drizzle-orm/pg-core";
var agentConfigRevisions;
var init_agent_config_revisions = __esm({
  "../packages/db/src/schema/agent_config_revisions.ts"() {
    "use strict";
    init_companies();
    init_agents();
    agentConfigRevisions = pgTable15(
      "agent_config_revisions",
      {
        id: uuid14("id").primaryKey().defaultRandom(),
        companyId: uuid14("company_id").notNull().references(() => companies.id),
        agentId: uuid14("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
        createdByAgentId: uuid14("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
        createdByUserId: text19("created_by_user_id"),
        source: text19("source").notNull().default("patch"),
        rolledBackFromRevisionId: uuid14("rolled_back_from_revision_id"),
        changedKeys: jsonb7("changed_keys").$type().notNull().default([]),
        beforeConfig: jsonb7("before_config").$type().notNull(),
        afterConfig: jsonb7("after_config").$type().notNull(),
        createdAt: timestamp15("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyAgentCreatedIdx: index11("agent_config_revisions_company_agent_created_idx").on(
          table.companyId,
          table.agentId,
          table.createdAt
        ),
        agentCreatedIdx: index11("agent_config_revisions_agent_created_idx").on(table.agentId, table.createdAt)
      })
    );
  }
});

// ../packages/db/src/schema/agent_api_keys.ts
import { pgTable as pgTable16, uuid as uuid15, text as text20, timestamp as timestamp16, index as index12 } from "drizzle-orm/pg-core";
var agentApiKeys;
var init_agent_api_keys = __esm({
  "../packages/db/src/schema/agent_api_keys.ts"() {
    "use strict";
    init_agents();
    init_companies();
    agentApiKeys = pgTable16(
      "agent_api_keys",
      {
        id: uuid15("id").primaryKey().defaultRandom(),
        agentId: uuid15("agent_id").notNull().references(() => agents.id),
        companyId: uuid15("company_id").notNull().references(() => companies.id),
        name: text20("name").notNull(),
        keyHash: text20("key_hash").notNull(),
        lastUsedAt: timestamp16("last_used_at", { withTimezone: true }),
        revokedAt: timestamp16("revoked_at", { withTimezone: true }),
        createdAt: timestamp16("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        keyHashIdx: index12("agent_api_keys_key_hash_idx").on(table.keyHash),
        companyAgentIdx: index12("agent_api_keys_company_agent_idx").on(table.companyId, table.agentId)
      })
    );
  }
});

// ../packages/db/src/schema/agent_runtime_state.ts
import { pgTable as pgTable17, uuid as uuid16, text as text21, timestamp as timestamp17, jsonb as jsonb8, bigint, index as index13 } from "drizzle-orm/pg-core";
var agentRuntimeState;
var init_agent_runtime_state = __esm({
  "../packages/db/src/schema/agent_runtime_state.ts"() {
    "use strict";
    init_agents();
    init_companies();
    agentRuntimeState = pgTable17(
      "agent_runtime_state",
      {
        agentId: uuid16("agent_id").primaryKey().references(() => agents.id),
        companyId: uuid16("company_id").notNull().references(() => companies.id),
        adapterType: text21("adapter_type").notNull(),
        sessionId: text21("session_id"),
        stateJson: jsonb8("state_json").$type().notNull().default({}),
        lastRunId: uuid16("last_run_id"),
        lastRunStatus: text21("last_run_status"),
        totalInputTokens: bigint("total_input_tokens", { mode: "number" }).notNull().default(0),
        totalOutputTokens: bigint("total_output_tokens", { mode: "number" }).notNull().default(0),
        totalCachedInputTokens: bigint("total_cached_input_tokens", { mode: "number" }).notNull().default(0),
        totalCostCents: bigint("total_cost_cents", { mode: "number" }).notNull().default(0),
        lastError: text21("last_error"),
        createdAt: timestamp17("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp17("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyAgentIdx: index13("agent_runtime_state_company_agent_idx").on(table.companyId, table.agentId),
        companyUpdatedIdx: index13("agent_runtime_state_company_updated_idx").on(table.companyId, table.updatedAt)
      })
    );
  }
});

// ../packages/db/src/schema/agent_wakeup_requests.ts
import { pgTable as pgTable18, uuid as uuid17, text as text22, timestamp as timestamp18, jsonb as jsonb9, integer as integer6, index as index14 } from "drizzle-orm/pg-core";
var agentWakeupRequests;
var init_agent_wakeup_requests = __esm({
  "../packages/db/src/schema/agent_wakeup_requests.ts"() {
    "use strict";
    init_companies();
    init_agents();
    agentWakeupRequests = pgTable18(
      "agent_wakeup_requests",
      {
        id: uuid17("id").primaryKey().defaultRandom(),
        companyId: uuid17("company_id").notNull().references(() => companies.id),
        agentId: uuid17("agent_id").notNull().references(() => agents.id),
        source: text22("source").notNull(),
        triggerDetail: text22("trigger_detail"),
        reason: text22("reason"),
        payload: jsonb9("payload").$type(),
        status: text22("status").notNull().default("queued"),
        coalescedCount: integer6("coalesced_count").notNull().default(0),
        requestedByActorType: text22("requested_by_actor_type"),
        requestedByActorId: text22("requested_by_actor_id"),
        idempotencyKey: text22("idempotency_key"),
        runId: uuid17("run_id"),
        requestedAt: timestamp18("requested_at", { withTimezone: true }).notNull().defaultNow(),
        claimedAt: timestamp18("claimed_at", { withTimezone: true }),
        finishedAt: timestamp18("finished_at", { withTimezone: true }),
        error: text22("error"),
        createdAt: timestamp18("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp18("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyAgentStatusIdx: index14("agent_wakeup_requests_company_agent_status_idx").on(
          table.companyId,
          table.agentId,
          table.status
        ),
        companyRequestedIdx: index14("agent_wakeup_requests_company_requested_idx").on(
          table.companyId,
          table.requestedAt
        ),
        agentRequestedIdx: index14("agent_wakeup_requests_agent_requested_idx").on(table.agentId, table.requestedAt)
      })
    );
  }
});

// ../packages/db/src/schema/heartbeat_runs.ts
import { pgTable as pgTable19, uuid as uuid18, text as text23, timestamp as timestamp19, jsonb as jsonb10, index as index15, integer as integer7, bigint as bigint2, boolean as boolean4 } from "drizzle-orm/pg-core";
var heartbeatRuns;
var init_heartbeat_runs = __esm({
  "../packages/db/src/schema/heartbeat_runs.ts"() {
    "use strict";
    init_companies();
    init_agents();
    init_agent_wakeup_requests();
    heartbeatRuns = pgTable19(
      "heartbeat_runs",
      {
        id: uuid18("id").primaryKey().defaultRandom(),
        companyId: uuid18("company_id").notNull().references(() => companies.id),
        agentId: uuid18("agent_id").notNull().references(() => agents.id),
        invocationSource: text23("invocation_source").notNull().default("on_demand"),
        triggerDetail: text23("trigger_detail"),
        status: text23("status").notNull().default("queued"),
        startedAt: timestamp19("started_at", { withTimezone: true }),
        finishedAt: timestamp19("finished_at", { withTimezone: true }),
        error: text23("error"),
        wakeupRequestId: uuid18("wakeup_request_id").references(() => agentWakeupRequests.id),
        exitCode: integer7("exit_code"),
        signal: text23("signal"),
        usageJson: jsonb10("usage_json").$type(),
        resultJson: jsonb10("result_json").$type(),
        sessionIdBefore: text23("session_id_before"),
        sessionIdAfter: text23("session_id_after"),
        logStore: text23("log_store"),
        logRef: text23("log_ref"),
        logBytes: bigint2("log_bytes", { mode: "number" }),
        logSha256: text23("log_sha256"),
        logCompressed: boolean4("log_compressed").notNull().default(false),
        stdoutExcerpt: text23("stdout_excerpt"),
        stderrExcerpt: text23("stderr_excerpt"),
        errorCode: text23("error_code"),
        externalRunId: text23("external_run_id"),
        processPid: integer7("process_pid"),
        processStartedAt: timestamp19("process_started_at", { withTimezone: true }),
        retryOfRunId: uuid18("retry_of_run_id").references(() => heartbeatRuns.id, {
          onDelete: "set null"
        }),
        processLossRetryCount: integer7("process_loss_retry_count").notNull().default(0),
        contextSnapshot: jsonb10("context_snapshot").$type(),
        createdAt: timestamp19("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp19("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyAgentStartedIdx: index15("heartbeat_runs_company_agent_started_idx").on(
          table.companyId,
          table.agentId,
          table.startedAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/agent_task_sessions.ts
import { pgTable as pgTable20, uuid as uuid19, text as text24, timestamp as timestamp20, jsonb as jsonb11, index as index16, uniqueIndex as uniqueIndex12 } from "drizzle-orm/pg-core";
var agentTaskSessions;
var init_agent_task_sessions = __esm({
  "../packages/db/src/schema/agent_task_sessions.ts"() {
    "use strict";
    init_companies();
    init_agents();
    init_heartbeat_runs();
    agentTaskSessions = pgTable20(
      "agent_task_sessions",
      {
        id: uuid19("id").primaryKey().defaultRandom(),
        companyId: uuid19("company_id").notNull().references(() => companies.id),
        agentId: uuid19("agent_id").notNull().references(() => agents.id),
        adapterType: text24("adapter_type").notNull(),
        taskKey: text24("task_key").notNull(),
        sessionParamsJson: jsonb11("session_params_json").$type(),
        sessionDisplayId: text24("session_display_id"),
        lastRunId: uuid19("last_run_id").references(() => heartbeatRuns.id),
        lastError: text24("last_error"),
        createdAt: timestamp20("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp20("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyAgentTaskUniqueIdx: uniqueIndex12("agent_task_sessions_company_agent_adapter_task_uniq").on(
          table.companyId,
          table.agentId,
          table.adapterType,
          table.taskKey
        ),
        companyAgentUpdatedIdx: index16("agent_task_sessions_company_agent_updated_idx").on(
          table.companyId,
          table.agentId,
          table.updatedAt
        ),
        companyTaskUpdatedIdx: index16("agent_task_sessions_company_task_updated_idx").on(
          table.companyId,
          table.taskKey,
          table.updatedAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/goals.ts
import {
  pgTable as pgTable21,
  uuid as uuid20,
  text as text25,
  timestamp as timestamp21,
  index as index17
} from "drizzle-orm/pg-core";
var goals;
var init_goals = __esm({
  "../packages/db/src/schema/goals.ts"() {
    "use strict";
    init_agents();
    init_companies();
    goals = pgTable21(
      "goals",
      {
        id: uuid20("id").primaryKey().defaultRandom(),
        companyId: uuid20("company_id").notNull().references(() => companies.id),
        title: text25("title").notNull(),
        description: text25("description"),
        level: text25("level").notNull().default("task"),
        status: text25("status").notNull().default("planned"),
        parentId: uuid20("parent_id").references(() => goals.id),
        ownerAgentId: uuid20("owner_agent_id").references(() => agents.id),
        createdAt: timestamp21("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp21("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyIdx: index17("goals_company_idx").on(table.companyId)
      })
    );
  }
});

// ../packages/db/src/schema/projects.ts
import { pgTable as pgTable22, uuid as uuid21, text as text26, timestamp as timestamp22, date, index as index18, jsonb as jsonb12 } from "drizzle-orm/pg-core";
var projects;
var init_projects = __esm({
  "../packages/db/src/schema/projects.ts"() {
    "use strict";
    init_companies();
    init_goals();
    init_agents();
    projects = pgTable22(
      "projects",
      {
        id: uuid21("id").primaryKey().defaultRandom(),
        companyId: uuid21("company_id").notNull().references(() => companies.id),
        goalId: uuid21("goal_id").references(() => goals.id),
        name: text26("name").notNull(),
        description: text26("description"),
        status: text26("status").notNull().default("backlog"),
        leadAgentId: uuid21("lead_agent_id").references(() => agents.id),
        targetDate: date("target_date"),
        color: text26("color"),
        pauseReason: text26("pause_reason"),
        pausedAt: timestamp22("paused_at", { withTimezone: true }),
        executionWorkspacePolicy: jsonb12("execution_workspace_policy").$type(),
        archivedAt: timestamp22("archived_at", { withTimezone: true }),
        createdAt: timestamp22("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp22("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyIdx: index18("projects_company_idx").on(table.companyId)
      })
    );
  }
});

// ../packages/db/src/schema/project_workspaces.ts
import {
  boolean as boolean5,
  index as index19,
  jsonb as jsonb13,
  pgTable as pgTable23,
  text as text27,
  timestamp as timestamp23,
  uniqueIndex as uniqueIndex13,
  uuid as uuid22
} from "drizzle-orm/pg-core";
var projectWorkspaces;
var init_project_workspaces = __esm({
  "../packages/db/src/schema/project_workspaces.ts"() {
    "use strict";
    init_companies();
    init_projects();
    projectWorkspaces = pgTable23(
      "project_workspaces",
      {
        id: uuid22("id").primaryKey().defaultRandom(),
        companyId: uuid22("company_id").notNull().references(() => companies.id),
        projectId: uuid22("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
        name: text27("name").notNull(),
        sourceType: text27("source_type").notNull().default("local_path"),
        cwd: text27("cwd"),
        repoUrl: text27("repo_url"),
        repoRef: text27("repo_ref"),
        defaultRef: text27("default_ref"),
        visibility: text27("visibility").notNull().default("default"),
        setupCommand: text27("setup_command"),
        cleanupCommand: text27("cleanup_command"),
        remoteProvider: text27("remote_provider"),
        remoteWorkspaceRef: text27("remote_workspace_ref"),
        sharedWorkspaceKey: text27("shared_workspace_key"),
        metadata: jsonb13("metadata").$type(),
        isPrimary: boolean5("is_primary").notNull().default(false),
        createdAt: timestamp23("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp23("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyProjectIdx: index19("project_workspaces_company_project_idx").on(table.companyId, table.projectId),
        projectPrimaryIdx: index19("project_workspaces_project_primary_idx").on(table.projectId, table.isPrimary),
        projectSourceTypeIdx: index19("project_workspaces_project_source_type_idx").on(table.projectId, table.sourceType),
        companySharedKeyIdx: index19("project_workspaces_company_shared_key_idx").on(table.companyId, table.sharedWorkspaceKey),
        projectRemoteRefIdx: uniqueIndex13("project_workspaces_project_remote_ref_idx").on(table.projectId, table.remoteProvider, table.remoteWorkspaceRef)
      })
    );
  }
});

// ../packages/db/src/schema/tickets.ts
import { pgTable as pgTable24, uuid as uuid23, text as text28, timestamp as timestamp24, jsonb as jsonb14, index as index20 } from "drizzle-orm/pg-core";
var tickets;
var init_tickets = __esm({
  "../packages/db/src/schema/tickets.ts"() {
    "use strict";
    init_companies();
    tickets = pgTable24(
      "tickets",
      {
        id: uuid23("id").primaryKey().defaultRandom(),
        companyId: uuid23("company_id").notNull().references(() => companies.id),
        title: text28("title").notNull(),
        description: text28("description"),
        identifier: text28("identifier"),
        status: text28("status").notNull().default("active"),
        currentStage: text28("current_stage").notNull().default("planning"),
        stageOrder: jsonb14("stage_order").$type().notNull().default(["planning", "execution", "review", "qa", "human"]),
        createdByUserId: text28("created_by_user_id"),
        createdByAgentId: uuid23("created_by_agent_id"),
        completedAt: timestamp24("completed_at", { withTimezone: true }),
        createdAt: timestamp24("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp24("updated_at", { withTimezone: true }).notNull().defaultNow(),
        metadata: jsonb14("metadata").$type().default({}),
        instructions: text28("instructions"),
        leadAgentId: uuid23("lead_agent_id")
      },
      (table) => ({
        companyIdx: index20("tickets_company_idx").on(table.companyId),
        companyStatusIdx: index20("tickets_company_status_idx").on(table.companyId, table.status)
      })
    );
  }
});

// ../packages/db/src/schema/issues.ts
import {
  pgTable as pgTable25,
  uuid as uuid24,
  text as text29,
  timestamp as timestamp25,
  integer as integer8,
  jsonb as jsonb15,
  index as index21,
  uniqueIndex as uniqueIndex14
} from "drizzle-orm/pg-core";
var issues;
var init_issues = __esm({
  "../packages/db/src/schema/issues.ts"() {
    "use strict";
    init_agents();
    init_projects();
    init_goals();
    init_companies();
    init_heartbeat_runs();
    init_project_workspaces();
    init_execution_workspaces();
    init_tickets();
    issues = pgTable25(
      "issues",
      {
        id: uuid24("id").primaryKey().defaultRandom(),
        companyId: uuid24("company_id").notNull().references(() => companies.id),
        projectId: uuid24("project_id").references(() => projects.id),
        projectWorkspaceId: uuid24("project_workspace_id").references(() => projectWorkspaces.id, { onDelete: "set null" }),
        goalId: uuid24("goal_id").references(() => goals.id),
        parentId: uuid24("parent_id").references(() => issues.id),
        ticketId: uuid24("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
        // Which pipeline stage this issue belongs to within its ticket
        ticketStage: text29("ticket_stage"),
        title: text29("title").notNull(),
        description: text29("description"),
        status: text29("status").notNull().default("backlog"),
        priority: text29("priority").notNull().default("medium"),
        assigneeAgentId: uuid24("assignee_agent_id").references(() => agents.id),
        assigneeUserId: text29("assignee_user_id"),
        checkoutRunId: uuid24("checkout_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
        executionRunId: uuid24("execution_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
        executionAgentNameKey: text29("execution_agent_name_key"),
        executionLockedAt: timestamp25("execution_locked_at", { withTimezone: true }),
        createdByAgentId: uuid24("created_by_agent_id").references(() => agents.id),
        createdByUserId: text29("created_by_user_id"),
        issueNumber: integer8("issue_number"),
        identifier: text29("identifier"),
        requestDepth: integer8("request_depth").notNull().default(0),
        billingCode: text29("billing_code"),
        assigneeAdapterOverrides: jsonb15("assignee_adapter_overrides").$type(),
        executionWorkspaceId: uuid24("execution_workspace_id").references(() => executionWorkspaces.id, { onDelete: "set null" }),
        executionWorkspacePreference: text29("execution_workspace_preference"),
        executionWorkspaceSettings: jsonb15("execution_workspace_settings").$type(),
        startedAt: timestamp25("started_at", { withTimezone: true }),
        completedAt: timestamp25("completed_at", { withTimezone: true }),
        cancelledAt: timestamp25("cancelled_at", { withTimezone: true }),
        hiddenAt: timestamp25("hidden_at", { withTimezone: true }),
        createdAt: timestamp25("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp25("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyStatusIdx: index21("issues_company_status_idx").on(table.companyId, table.status),
        assigneeStatusIdx: index21("issues_company_assignee_status_idx").on(
          table.companyId,
          table.assigneeAgentId,
          table.status
        ),
        assigneeUserStatusIdx: index21("issues_company_assignee_user_status_idx").on(
          table.companyId,
          table.assigneeUserId,
          table.status
        ),
        parentIdx: index21("issues_company_parent_idx").on(table.companyId, table.parentId),
        ticketIdx: index21("issues_company_ticket_idx").on(table.companyId, table.ticketId),
        projectIdx: index21("issues_company_project_idx").on(table.companyId, table.projectId),
        projectWorkspaceIdx: index21("issues_company_project_workspace_idx").on(table.companyId, table.projectWorkspaceId),
        executionWorkspaceIdx: index21("issues_company_execution_workspace_idx").on(table.companyId, table.executionWorkspaceId),
        identifierIdx: uniqueIndex14("issues_identifier_idx").on(table.identifier)
      })
    );
  }
});

// ../packages/db/src/schema/execution_workspaces.ts
import {
  index as index22,
  jsonb as jsonb16,
  pgTable as pgTable26,
  text as text30,
  timestamp as timestamp26,
  uuid as uuid25
} from "drizzle-orm/pg-core";
var executionWorkspaces;
var init_execution_workspaces = __esm({
  "../packages/db/src/schema/execution_workspaces.ts"() {
    "use strict";
    init_companies();
    init_issues();
    init_project_workspaces();
    init_projects();
    executionWorkspaces = pgTable26(
      "execution_workspaces",
      {
        id: uuid25("id").primaryKey().defaultRandom(),
        companyId: uuid25("company_id").notNull().references(() => companies.id),
        projectId: uuid25("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
        projectWorkspaceId: uuid25("project_workspace_id").references(() => projectWorkspaces.id, { onDelete: "set null" }),
        sourceIssueId: uuid25("source_issue_id").references(() => issues.id, { onDelete: "set null" }),
        mode: text30("mode").notNull(),
        strategyType: text30("strategy_type").notNull(),
        name: text30("name").notNull(),
        status: text30("status").notNull().default("active"),
        cwd: text30("cwd"),
        repoUrl: text30("repo_url"),
        baseRef: text30("base_ref"),
        branchName: text30("branch_name"),
        providerType: text30("provider_type").notNull().default("local_fs"),
        providerRef: text30("provider_ref"),
        derivedFromExecutionWorkspaceId: uuid25("derived_from_execution_workspace_id").references(() => executionWorkspaces.id, { onDelete: "set null" }),
        lastUsedAt: timestamp26("last_used_at", { withTimezone: true }).notNull().defaultNow(),
        openedAt: timestamp26("opened_at", { withTimezone: true }).notNull().defaultNow(),
        closedAt: timestamp26("closed_at", { withTimezone: true }),
        cleanupEligibleAt: timestamp26("cleanup_eligible_at", { withTimezone: true }),
        cleanupReason: text30("cleanup_reason"),
        metadata: jsonb16("metadata").$type(),
        createdAt: timestamp26("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp26("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyProjectStatusIdx: index22("execution_workspaces_company_project_status_idx").on(
          table.companyId,
          table.projectId,
          table.status
        ),
        companyProjectWorkspaceStatusIdx: index22("execution_workspaces_company_project_workspace_status_idx").on(
          table.companyId,
          table.projectWorkspaceId,
          table.status
        ),
        companySourceIssueIdx: index22("execution_workspaces_company_source_issue_idx").on(
          table.companyId,
          table.sourceIssueId
        ),
        companyLastUsedIdx: index22("execution_workspaces_company_last_used_idx").on(
          table.companyId,
          table.lastUsedAt
        ),
        companyBranchIdx: index22("execution_workspaces_company_branch_idx").on(
          table.companyId,
          table.branchName
        )
      })
    );
  }
});

// ../packages/db/src/schema/workspace_operations.ts
import {
  bigint as bigint3,
  boolean as boolean6,
  index as index23,
  integer as integer9,
  jsonb as jsonb17,
  pgTable as pgTable27,
  text as text31,
  timestamp as timestamp27,
  uuid as uuid26
} from "drizzle-orm/pg-core";
var workspaceOperations;
var init_workspace_operations = __esm({
  "../packages/db/src/schema/workspace_operations.ts"() {
    "use strict";
    init_companies();
    init_execution_workspaces();
    init_heartbeat_runs();
    workspaceOperations = pgTable27(
      "workspace_operations",
      {
        id: uuid26("id").primaryKey().defaultRandom(),
        companyId: uuid26("company_id").notNull().references(() => companies.id),
        executionWorkspaceId: uuid26("execution_workspace_id").references(() => executionWorkspaces.id, {
          onDelete: "set null"
        }),
        heartbeatRunId: uuid26("heartbeat_run_id").references(() => heartbeatRuns.id, {
          onDelete: "set null"
        }),
        phase: text31("phase").notNull(),
        command: text31("command"),
        cwd: text31("cwd"),
        status: text31("status").notNull().default("running"),
        exitCode: integer9("exit_code"),
        logStore: text31("log_store"),
        logRef: text31("log_ref"),
        logBytes: bigint3("log_bytes", { mode: "number" }),
        logSha256: text31("log_sha256"),
        logCompressed: boolean6("log_compressed").notNull().default(false),
        stdoutExcerpt: text31("stdout_excerpt"),
        stderrExcerpt: text31("stderr_excerpt"),
        metadata: jsonb17("metadata").$type(),
        startedAt: timestamp27("started_at", { withTimezone: true }).notNull().defaultNow(),
        finishedAt: timestamp27("finished_at", { withTimezone: true }),
        createdAt: timestamp27("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp27("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyRunStartedIdx: index23("workspace_operations_company_run_started_idx").on(
          table.companyId,
          table.heartbeatRunId,
          table.startedAt
        ),
        companyWorkspaceStartedIdx: index23("workspace_operations_company_workspace_started_idx").on(
          table.companyId,
          table.executionWorkspaceId,
          table.startedAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/workspace_runtime_services.ts
import {
  index as index24,
  integer as integer10,
  jsonb as jsonb18,
  pgTable as pgTable28,
  text as text32,
  timestamp as timestamp28,
  uuid as uuid27
} from "drizzle-orm/pg-core";
var workspaceRuntimeServices;
var init_workspace_runtime_services = __esm({
  "../packages/db/src/schema/workspace_runtime_services.ts"() {
    "use strict";
    init_companies();
    init_projects();
    init_project_workspaces();
    init_execution_workspaces();
    init_issues();
    init_agents();
    init_heartbeat_runs();
    workspaceRuntimeServices = pgTable28(
      "workspace_runtime_services",
      {
        id: uuid27("id").primaryKey(),
        companyId: uuid27("company_id").notNull().references(() => companies.id),
        projectId: uuid27("project_id").references(() => projects.id, { onDelete: "set null" }),
        projectWorkspaceId: uuid27("project_workspace_id").references(() => projectWorkspaces.id, { onDelete: "set null" }),
        executionWorkspaceId: uuid27("execution_workspace_id").references(() => executionWorkspaces.id, { onDelete: "set null" }),
        issueId: uuid27("issue_id").references(() => issues.id, { onDelete: "set null" }),
        scopeType: text32("scope_type").notNull(),
        scopeId: text32("scope_id"),
        serviceName: text32("service_name").notNull(),
        status: text32("status").notNull(),
        lifecycle: text32("lifecycle").notNull(),
        reuseKey: text32("reuse_key"),
        command: text32("command"),
        cwd: text32("cwd"),
        port: integer10("port"),
        url: text32("url"),
        provider: text32("provider").notNull(),
        providerRef: text32("provider_ref"),
        ownerAgentId: uuid27("owner_agent_id").references(() => agents.id, { onDelete: "set null" }),
        startedByRunId: uuid27("started_by_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
        lastUsedAt: timestamp28("last_used_at", { withTimezone: true }).notNull().defaultNow(),
        startedAt: timestamp28("started_at", { withTimezone: true }).notNull().defaultNow(),
        stoppedAt: timestamp28("stopped_at", { withTimezone: true }),
        stopPolicy: jsonb18("stop_policy").$type(),
        healthStatus: text32("health_status").notNull().default("unknown"),
        createdAt: timestamp28("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp28("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyWorkspaceStatusIdx: index24("workspace_runtime_services_company_workspace_status_idx").on(
          table.companyId,
          table.projectWorkspaceId,
          table.status
        ),
        companyExecutionWorkspaceStatusIdx: index24("workspace_runtime_services_company_execution_workspace_status_idx").on(
          table.companyId,
          table.executionWorkspaceId,
          table.status
        ),
        companyProjectStatusIdx: index24("workspace_runtime_services_company_project_status_idx").on(
          table.companyId,
          table.projectId,
          table.status
        ),
        runIdx: index24("workspace_runtime_services_run_idx").on(table.startedByRunId),
        companyUpdatedIdx: index24("workspace_runtime_services_company_updated_idx").on(
          table.companyId,
          table.updatedAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/project_goals.ts
import { pgTable as pgTable29, uuid as uuid28, timestamp as timestamp29, index as index25, primaryKey } from "drizzle-orm/pg-core";
var projectGoals;
var init_project_goals = __esm({
  "../packages/db/src/schema/project_goals.ts"() {
    "use strict";
    init_companies();
    init_projects();
    init_goals();
    projectGoals = pgTable29(
      "project_goals",
      {
        projectId: uuid28("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
        goalId: uuid28("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
        companyId: uuid28("company_id").notNull().references(() => companies.id),
        createdAt: timestamp29("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp29("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        pk: primaryKey({ columns: [table.projectId, table.goalId] }),
        projectIdx: index25("project_goals_project_idx").on(table.projectId),
        goalIdx: index25("project_goals_goal_idx").on(table.goalId),
        companyIdx: index25("project_goals_company_idx").on(table.companyId)
      })
    );
  }
});

// ../packages/db/src/schema/issue_work_products.ts
import {
  boolean as boolean7,
  index as index26,
  jsonb as jsonb19,
  pgTable as pgTable30,
  text as text33,
  timestamp as timestamp30,
  uuid as uuid29
} from "drizzle-orm/pg-core";
var issueWorkProducts;
var init_issue_work_products = __esm({
  "../packages/db/src/schema/issue_work_products.ts"() {
    "use strict";
    init_companies();
    init_execution_workspaces();
    init_heartbeat_runs();
    init_issues();
    init_projects();
    init_workspace_runtime_services();
    issueWorkProducts = pgTable30(
      "issue_work_products",
      {
        id: uuid29("id").primaryKey().defaultRandom(),
        companyId: uuid29("company_id").notNull().references(() => companies.id),
        projectId: uuid29("project_id").references(() => projects.id, { onDelete: "set null" }),
        issueId: uuid29("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
        executionWorkspaceId: uuid29("execution_workspace_id").references(() => executionWorkspaces.id, { onDelete: "set null" }),
        runtimeServiceId: uuid29("runtime_service_id").references(() => workspaceRuntimeServices.id, { onDelete: "set null" }),
        type: text33("type").notNull(),
        provider: text33("provider").notNull(),
        externalId: text33("external_id"),
        title: text33("title").notNull(),
        url: text33("url"),
        status: text33("status").notNull(),
        reviewState: text33("review_state").notNull().default("none"),
        isPrimary: boolean7("is_primary").notNull().default(false),
        healthStatus: text33("health_status").notNull().default("unknown"),
        summary: text33("summary"),
        metadata: jsonb19("metadata").$type(),
        createdByRunId: uuid29("created_by_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
        createdAt: timestamp30("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp30("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyIssueTypeIdx: index26("issue_work_products_company_issue_type_idx").on(
          table.companyId,
          table.issueId,
          table.type
        ),
        companyExecutionWorkspaceTypeIdx: index26("issue_work_products_company_execution_workspace_type_idx").on(
          table.companyId,
          table.executionWorkspaceId,
          table.type
        ),
        companyProviderExternalIdIdx: index26("issue_work_products_company_provider_external_id_idx").on(
          table.companyId,
          table.provider,
          table.externalId
        ),
        companyUpdatedIdx: index26("issue_work_products_company_updated_idx").on(
          table.companyId,
          table.updatedAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/labels.ts
import { pgTable as pgTable31, uuid as uuid30, text as text34, timestamp as timestamp31, index as index27, uniqueIndex as uniqueIndex15 } from "drizzle-orm/pg-core";
var labels;
var init_labels = __esm({
  "../packages/db/src/schema/labels.ts"() {
    "use strict";
    init_companies();
    labels = pgTable31(
      "labels",
      {
        id: uuid30("id").primaryKey().defaultRandom(),
        companyId: uuid30("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
        name: text34("name").notNull(),
        color: text34("color").notNull(),
        createdAt: timestamp31("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp31("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyIdx: index27("labels_company_idx").on(table.companyId),
        companyNameIdx: uniqueIndex15("labels_company_name_idx").on(table.companyId, table.name)
      })
    );
  }
});

// ../packages/db/src/schema/issue_labels.ts
import { pgTable as pgTable32, uuid as uuid31, timestamp as timestamp32, index as index28, primaryKey as primaryKey2 } from "drizzle-orm/pg-core";
var issueLabels;
var init_issue_labels = __esm({
  "../packages/db/src/schema/issue_labels.ts"() {
    "use strict";
    init_companies();
    init_issues();
    init_labels();
    issueLabels = pgTable32(
      "issue_labels",
      {
        issueId: uuid31("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
        labelId: uuid31("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
        companyId: uuid31("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
        createdAt: timestamp32("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        pk: primaryKey2({ columns: [table.issueId, table.labelId], name: "issue_labels_pk" }),
        issueIdx: index28("issue_labels_issue_idx").on(table.issueId),
        labelIdx: index28("issue_labels_label_idx").on(table.labelId),
        companyIdx: index28("issue_labels_company_idx").on(table.companyId)
      })
    );
  }
});

// ../packages/db/src/schema/issue_approvals.ts
import { pgTable as pgTable33, uuid as uuid32, text as text35, timestamp as timestamp33, index as index29, primaryKey as primaryKey3 } from "drizzle-orm/pg-core";
var issueApprovals;
var init_issue_approvals = __esm({
  "../packages/db/src/schema/issue_approvals.ts"() {
    "use strict";
    init_companies();
    init_issues();
    init_approvals();
    init_agents();
    issueApprovals = pgTable33(
      "issue_approvals",
      {
        companyId: uuid32("company_id").notNull().references(() => companies.id),
        issueId: uuid32("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
        approvalId: uuid32("approval_id").notNull().references(() => approvals.id, { onDelete: "cascade" }),
        linkedByAgentId: uuid32("linked_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
        linkedByUserId: text35("linked_by_user_id"),
        createdAt: timestamp33("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        pk: primaryKey3({ columns: [table.issueId, table.approvalId], name: "issue_approvals_pk" }),
        issueIdx: index29("issue_approvals_issue_idx").on(table.issueId),
        approvalIdx: index29("issue_approvals_approval_idx").on(table.approvalId),
        companyIdx: index29("issue_approvals_company_idx").on(table.companyId)
      })
    );
  }
});

// ../packages/db/src/schema/issue_comments.ts
import { pgTable as pgTable34, uuid as uuid33, text as text36, timestamp as timestamp34, index as index30 } from "drizzle-orm/pg-core";
var issueComments;
var init_issue_comments = __esm({
  "../packages/db/src/schema/issue_comments.ts"() {
    "use strict";
    init_companies();
    init_issues();
    init_agents();
    issueComments = pgTable34(
      "issue_comments",
      {
        id: uuid33("id").primaryKey().defaultRandom(),
        companyId: uuid33("company_id").notNull().references(() => companies.id),
        issueId: uuid33("issue_id").notNull().references(() => issues.id),
        authorAgentId: uuid33("author_agent_id").references(() => agents.id),
        authorUserId: text36("author_user_id"),
        body: text36("body").notNull(),
        createdAt: timestamp34("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp34("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        issueIdx: index30("issue_comments_issue_idx").on(table.issueId),
        companyIdx: index30("issue_comments_company_idx").on(table.companyId),
        companyIssueCreatedAtIdx: index30("issue_comments_company_issue_created_at_idx").on(
          table.companyId,
          table.issueId,
          table.createdAt
        ),
        companyAuthorIssueCreatedAtIdx: index30("issue_comments_company_author_issue_created_at_idx").on(
          table.companyId,
          table.authorUserId,
          table.issueId,
          table.createdAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/issue_read_states.ts
import { pgTable as pgTable35, uuid as uuid34, text as text37, timestamp as timestamp35, index as index31, uniqueIndex as uniqueIndex16 } from "drizzle-orm/pg-core";
var issueReadStates;
var init_issue_read_states = __esm({
  "../packages/db/src/schema/issue_read_states.ts"() {
    "use strict";
    init_companies();
    init_issues();
    issueReadStates = pgTable35(
      "issue_read_states",
      {
        id: uuid34("id").primaryKey().defaultRandom(),
        companyId: uuid34("company_id").notNull().references(() => companies.id),
        issueId: uuid34("issue_id").notNull().references(() => issues.id),
        userId: text37("user_id").notNull(),
        lastReadAt: timestamp35("last_read_at", { withTimezone: true }).notNull().defaultNow(),
        createdAt: timestamp35("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp35("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyIssueIdx: index31("issue_read_states_company_issue_idx").on(table.companyId, table.issueId),
        companyUserIdx: index31("issue_read_states_company_user_idx").on(table.companyId, table.userId),
        companyIssueUserUnique: uniqueIndex16("issue_read_states_company_issue_user_idx").on(
          table.companyId,
          table.issueId,
          table.userId
        )
      })
    );
  }
});

// ../packages/db/src/schema/issue_attachments.ts
import { pgTable as pgTable36, uuid as uuid35, timestamp as timestamp36, index as index32, uniqueIndex as uniqueIndex17 } from "drizzle-orm/pg-core";
var issueAttachments;
var init_issue_attachments = __esm({
  "../packages/db/src/schema/issue_attachments.ts"() {
    "use strict";
    init_companies();
    init_issues();
    init_assets();
    init_issue_comments();
    issueAttachments = pgTable36(
      "issue_attachments",
      {
        id: uuid35("id").primaryKey().defaultRandom(),
        companyId: uuid35("company_id").notNull().references(() => companies.id),
        issueId: uuid35("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
        assetId: uuid35("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
        issueCommentId: uuid35("issue_comment_id").references(() => issueComments.id, { onDelete: "set null" }),
        createdAt: timestamp36("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp36("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyIssueIdx: index32("issue_attachments_company_issue_idx").on(table.companyId, table.issueId),
        issueCommentIdx: index32("issue_attachments_issue_comment_idx").on(table.issueCommentId),
        assetUq: uniqueIndex17("issue_attachments_asset_uq").on(table.assetId)
      })
    );
  }
});

// ../packages/db/src/schema/documents.ts
import { pgTable as pgTable37, uuid as uuid36, text as text38, integer as integer11, timestamp as timestamp37, index as index33 } from "drizzle-orm/pg-core";
var documents;
var init_documents = __esm({
  "../packages/db/src/schema/documents.ts"() {
    "use strict";
    init_companies();
    init_agents();
    documents = pgTable37(
      "documents",
      {
        id: uuid36("id").primaryKey().defaultRandom(),
        companyId: uuid36("company_id").notNull().references(() => companies.id),
        title: text38("title"),
        format: text38("format").notNull().default("markdown"),
        latestBody: text38("latest_body").notNull(),
        latestRevisionId: uuid36("latest_revision_id"),
        latestRevisionNumber: integer11("latest_revision_number").notNull().default(1),
        createdByAgentId: uuid36("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
        createdByUserId: text38("created_by_user_id"),
        updatedByAgentId: uuid36("updated_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
        updatedByUserId: text38("updated_by_user_id"),
        createdAt: timestamp37("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp37("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyUpdatedIdx: index33("documents_company_updated_idx").on(table.companyId, table.updatedAt),
        companyCreatedIdx: index33("documents_company_created_idx").on(table.companyId, table.createdAt)
      })
    );
  }
});

// ../packages/db/src/schema/kb_skill_docs.ts
import { pgTable as pgTable38, uuid as uuid37, text as text39, boolean as boolean8, timestamp as timestamp38, index as index34, jsonb as jsonb20 } from "drizzle-orm/pg-core";
var kbSkillDocs;
var init_kb_skill_docs = __esm({
  "../packages/db/src/schema/kb_skill_docs.ts"() {
    "use strict";
    init_companies();
    kbSkillDocs = pgTable38(
      "kb_skill_docs",
      {
        id: uuid37("id").primaryKey().defaultRandom(),
        companyId: uuid37("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
        name: text39("name").notNull(),
        description: text39("description").notNull().default(""),
        body: text39("body").notNull().default(""),
        format: text39("format").notNull().default("markdown"),
        source: text39("source").notNull().default("custom"),
        metadata: jsonb20("metadata").$type().notNull().default({}),
        isActive: boolean8("is_active").notNull().default(true),
        createdAt: timestamp38("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp38("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyActiveIdx: index34("kb_skill_docs_company_active_idx").on(table.companyId, table.isActive),
        companyUpdatedIdx: index34("kb_skill_docs_company_updated_idx").on(table.companyId, table.updatedAt)
      })
    );
  }
});

// ../packages/db/src/schema/document_revisions.ts
import { pgTable as pgTable39, uuid as uuid38, text as text40, integer as integer12, timestamp as timestamp39, index as index35, uniqueIndex as uniqueIndex18 } from "drizzle-orm/pg-core";
var documentRevisions;
var init_document_revisions = __esm({
  "../packages/db/src/schema/document_revisions.ts"() {
    "use strict";
    init_companies();
    init_agents();
    init_documents();
    documentRevisions = pgTable39(
      "document_revisions",
      {
        id: uuid38("id").primaryKey().defaultRandom(),
        companyId: uuid38("company_id").notNull().references(() => companies.id),
        documentId: uuid38("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
        revisionNumber: integer12("revision_number").notNull(),
        body: text40("body").notNull(),
        changeSummary: text40("change_summary"),
        createdByAgentId: uuid38("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
        createdByUserId: text40("created_by_user_id"),
        createdAt: timestamp39("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        documentRevisionUq: uniqueIndex18("document_revisions_document_revision_uq").on(
          table.documentId,
          table.revisionNumber
        ),
        companyDocumentCreatedIdx: index35("document_revisions_company_document_created_idx").on(
          table.companyId,
          table.documentId,
          table.createdAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/issue_documents.ts
import { pgTable as pgTable40, uuid as uuid39, text as text41, timestamp as timestamp40, index as index36, uniqueIndex as uniqueIndex19 } from "drizzle-orm/pg-core";
var issueDocuments;
var init_issue_documents = __esm({
  "../packages/db/src/schema/issue_documents.ts"() {
    "use strict";
    init_companies();
    init_issues();
    init_documents();
    issueDocuments = pgTable40(
      "issue_documents",
      {
        id: uuid39("id").primaryKey().defaultRandom(),
        companyId: uuid39("company_id").notNull().references(() => companies.id),
        issueId: uuid39("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
        documentId: uuid39("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
        key: text41("key").notNull(),
        createdAt: timestamp40("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp40("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyIssueKeyUq: uniqueIndex19("issue_documents_company_issue_key_uq").on(
          table.companyId,
          table.issueId,
          table.key
        ),
        documentUq: uniqueIndex19("issue_documents_document_uq").on(table.documentId),
        companyIssueUpdatedIdx: index36("issue_documents_company_issue_updated_idx").on(
          table.companyId,
          table.issueId,
          table.updatedAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/heartbeat_run_events.ts
import { pgTable as pgTable41, uuid as uuid40, text as text42, timestamp as timestamp41, integer as integer13, jsonb as jsonb21, index as index37, bigserial } from "drizzle-orm/pg-core";
var heartbeatRunEvents;
var init_heartbeat_run_events = __esm({
  "../packages/db/src/schema/heartbeat_run_events.ts"() {
    "use strict";
    init_companies();
    init_agents();
    init_heartbeat_runs();
    heartbeatRunEvents = pgTable41(
      "heartbeat_run_events",
      {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        companyId: uuid40("company_id").notNull().references(() => companies.id),
        runId: uuid40("run_id").notNull().references(() => heartbeatRuns.id),
        agentId: uuid40("agent_id").notNull().references(() => agents.id),
        seq: integer13("seq").notNull(),
        eventType: text42("event_type").notNull(),
        stream: text42("stream"),
        level: text42("level"),
        color: text42("color"),
        message: text42("message"),
        payload: jsonb21("payload").$type(),
        createdAt: timestamp41("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        runSeqIdx: index37("heartbeat_run_events_run_seq_idx").on(table.runId, table.seq),
        companyRunIdx: index37("heartbeat_run_events_company_run_idx").on(table.companyId, table.runId),
        companyCreatedIdx: index37("heartbeat_run_events_company_created_idx").on(table.companyId, table.createdAt)
      })
    );
  }
});

// ../packages/db/src/schema/cost_events.ts
import { pgTable as pgTable42, uuid as uuid41, text as text43, timestamp as timestamp42, integer as integer14, index as index38 } from "drizzle-orm/pg-core";
var costEvents;
var init_cost_events = __esm({
  "../packages/db/src/schema/cost_events.ts"() {
    "use strict";
    init_companies();
    init_agents();
    init_issues();
    init_projects();
    init_goals();
    init_heartbeat_runs();
    costEvents = pgTable42(
      "cost_events",
      {
        id: uuid41("id").primaryKey().defaultRandom(),
        companyId: uuid41("company_id").notNull().references(() => companies.id),
        agentId: uuid41("agent_id").notNull().references(() => agents.id),
        issueId: uuid41("issue_id").references(() => issues.id),
        projectId: uuid41("project_id").references(() => projects.id),
        goalId: uuid41("goal_id").references(() => goals.id),
        heartbeatRunId: uuid41("heartbeat_run_id").references(() => heartbeatRuns.id),
        billingCode: text43("billing_code"),
        provider: text43("provider").notNull(),
        biller: text43("biller").notNull().default("unknown"),
        billingType: text43("billing_type").notNull().default("unknown"),
        model: text43("model").notNull(),
        inputTokens: integer14("input_tokens").notNull().default(0),
        cachedInputTokens: integer14("cached_input_tokens").notNull().default(0),
        outputTokens: integer14("output_tokens").notNull().default(0),
        costCents: integer14("cost_cents").notNull(),
        occurredAt: timestamp42("occurred_at", { withTimezone: true }).notNull(),
        createdAt: timestamp42("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyOccurredIdx: index38("cost_events_company_occurred_idx").on(table.companyId, table.occurredAt),
        companyAgentOccurredIdx: index38("cost_events_company_agent_occurred_idx").on(
          table.companyId,
          table.agentId,
          table.occurredAt
        ),
        companyProviderOccurredIdx: index38("cost_events_company_provider_occurred_idx").on(
          table.companyId,
          table.provider,
          table.occurredAt
        ),
        companyBillerOccurredIdx: index38("cost_events_company_biller_occurred_idx").on(
          table.companyId,
          table.biller,
          table.occurredAt
        ),
        companyHeartbeatRunIdx: index38("cost_events_company_heartbeat_run_idx").on(
          table.companyId,
          table.heartbeatRunId
        )
      })
    );
  }
});

// ../packages/db/src/schema/finance_events.ts
import { pgTable as pgTable43, uuid as uuid42, text as text44, timestamp as timestamp43, integer as integer15, index as index39, boolean as boolean9, jsonb as jsonb22 } from "drizzle-orm/pg-core";
var financeEvents;
var init_finance_events = __esm({
  "../packages/db/src/schema/finance_events.ts"() {
    "use strict";
    init_companies();
    init_agents();
    init_issues();
    init_projects();
    init_goals();
    init_heartbeat_runs();
    init_cost_events();
    financeEvents = pgTable43(
      "finance_events",
      {
        id: uuid42("id").primaryKey().defaultRandom(),
        companyId: uuid42("company_id").notNull().references(() => companies.id),
        agentId: uuid42("agent_id").references(() => agents.id),
        issueId: uuid42("issue_id").references(() => issues.id),
        projectId: uuid42("project_id").references(() => projects.id),
        goalId: uuid42("goal_id").references(() => goals.id),
        heartbeatRunId: uuid42("heartbeat_run_id").references(() => heartbeatRuns.id),
        costEventId: uuid42("cost_event_id").references(() => costEvents.id),
        billingCode: text44("billing_code"),
        description: text44("description"),
        eventKind: text44("event_kind").notNull(),
        direction: text44("direction").notNull().default("debit"),
        biller: text44("biller").notNull(),
        provider: text44("provider"),
        executionAdapterType: text44("execution_adapter_type"),
        pricingTier: text44("pricing_tier"),
        region: text44("region"),
        model: text44("model"),
        quantity: integer15("quantity"),
        unit: text44("unit"),
        amountCents: integer15("amount_cents").notNull(),
        currency: text44("currency").notNull().default("USD"),
        estimated: boolean9("estimated").notNull().default(false),
        externalInvoiceId: text44("external_invoice_id"),
        metadataJson: jsonb22("metadata_json").$type(),
        occurredAt: timestamp43("occurred_at", { withTimezone: true }).notNull(),
        createdAt: timestamp43("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyOccurredIdx: index39("finance_events_company_occurred_idx").on(table.companyId, table.occurredAt),
        companyBillerOccurredIdx: index39("finance_events_company_biller_occurred_idx").on(
          table.companyId,
          table.biller,
          table.occurredAt
        ),
        companyKindOccurredIdx: index39("finance_events_company_kind_occurred_idx").on(
          table.companyId,
          table.eventKind,
          table.occurredAt
        ),
        companyDirectionOccurredIdx: index39("finance_events_company_direction_occurred_idx").on(
          table.companyId,
          table.direction,
          table.occurredAt
        ),
        companyHeartbeatRunIdx: index39("finance_events_company_heartbeat_run_idx").on(
          table.companyId,
          table.heartbeatRunId
        ),
        companyCostEventIdx: index39("finance_events_company_cost_event_idx").on(
          table.companyId,
          table.costEventId
        )
      })
    );
  }
});

// ../packages/db/src/schema/approval_comments.ts
import { pgTable as pgTable44, uuid as uuid43, text as text45, timestamp as timestamp44, index as index40 } from "drizzle-orm/pg-core";
var approvalComments;
var init_approval_comments = __esm({
  "../packages/db/src/schema/approval_comments.ts"() {
    "use strict";
    init_companies();
    init_approvals();
    init_agents();
    approvalComments = pgTable44(
      "approval_comments",
      {
        id: uuid43("id").primaryKey().defaultRandom(),
        companyId: uuid43("company_id").notNull().references(() => companies.id),
        approvalId: uuid43("approval_id").notNull().references(() => approvals.id),
        authorAgentId: uuid43("author_agent_id").references(() => agents.id),
        authorUserId: text45("author_user_id"),
        body: text45("body").notNull(),
        createdAt: timestamp44("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp44("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyIdx: index40("approval_comments_company_idx").on(table.companyId),
        approvalIdx: index40("approval_comments_approval_idx").on(table.approvalId),
        approvalCreatedIdx: index40("approval_comments_approval_created_idx").on(
          table.approvalId,
          table.createdAt
        )
      })
    );
  }
});

// ../packages/db/src/schema/activity_log.ts
import { pgTable as pgTable45, uuid as uuid44, text as text46, timestamp as timestamp45, jsonb as jsonb23, index as index41 } from "drizzle-orm/pg-core";
var activityLog;
var init_activity_log = __esm({
  "../packages/db/src/schema/activity_log.ts"() {
    "use strict";
    init_companies();
    init_agents();
    init_heartbeat_runs();
    activityLog = pgTable45(
      "activity_log",
      {
        id: uuid44("id").primaryKey().defaultRandom(),
        companyId: uuid44("company_id").notNull().references(() => companies.id),
        actorType: text46("actor_type").notNull().default("system"),
        actorId: text46("actor_id").notNull(),
        action: text46("action").notNull(),
        entityType: text46("entity_type").notNull(),
        entityId: text46("entity_id").notNull(),
        agentId: uuid44("agent_id").references(() => agents.id),
        runId: uuid44("run_id").references(() => heartbeatRuns.id),
        details: jsonb23("details").$type(),
        createdAt: timestamp45("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyCreatedIdx: index41("activity_log_company_created_idx").on(table.companyId, table.createdAt),
        runIdIdx: index41("activity_log_run_id_idx").on(table.runId),
        entityIdx: index41("activity_log_entity_type_id_idx").on(table.entityType, table.entityId)
      })
    );
  }
});

// ../packages/db/src/schema/company_secrets.ts
import { pgTable as pgTable46, uuid as uuid45, text as text47, timestamp as timestamp46, integer as integer16, index as index42, uniqueIndex as uniqueIndex20 } from "drizzle-orm/pg-core";
var companySecrets;
var init_company_secrets = __esm({
  "../packages/db/src/schema/company_secrets.ts"() {
    "use strict";
    init_companies();
    init_agents();
    companySecrets = pgTable46(
      "company_secrets",
      {
        id: uuid45("id").primaryKey().defaultRandom(),
        companyId: uuid45("company_id").notNull().references(() => companies.id),
        name: text47("name").notNull(),
        provider: text47("provider").notNull().default("local_encrypted"),
        externalRef: text47("external_ref"),
        latestVersion: integer16("latest_version").notNull().default(1),
        description: text47("description"),
        createdByAgentId: uuid45("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
        createdByUserId: text47("created_by_user_id"),
        createdAt: timestamp46("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp46("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyIdx: index42("company_secrets_company_idx").on(table.companyId),
        companyProviderIdx: index42("company_secrets_company_provider_idx").on(table.companyId, table.provider),
        companyNameUq: uniqueIndex20("company_secrets_company_name_uq").on(table.companyId, table.name)
      })
    );
  }
});

// ../packages/db/src/schema/company_secret_versions.ts
import { pgTable as pgTable47, uuid as uuid46, text as text48, timestamp as timestamp47, integer as integer17, jsonb as jsonb24, index as index43, uniqueIndex as uniqueIndex21 } from "drizzle-orm/pg-core";
var companySecretVersions;
var init_company_secret_versions = __esm({
  "../packages/db/src/schema/company_secret_versions.ts"() {
    "use strict";
    init_agents();
    init_company_secrets();
    companySecretVersions = pgTable47(
      "company_secret_versions",
      {
        id: uuid46("id").primaryKey().defaultRandom(),
        secretId: uuid46("secret_id").notNull().references(() => companySecrets.id, { onDelete: "cascade" }),
        version: integer17("version").notNull(),
        material: jsonb24("material").$type().notNull(),
        valueSha256: text48("value_sha256").notNull(),
        createdByAgentId: uuid46("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
        createdByUserId: text48("created_by_user_id"),
        createdAt: timestamp47("created_at", { withTimezone: true }).notNull().defaultNow(),
        revokedAt: timestamp47("revoked_at", { withTimezone: true })
      },
      (table) => ({
        secretIdx: index43("company_secret_versions_secret_idx").on(table.secretId, table.createdAt),
        valueHashIdx: index43("company_secret_versions_value_sha256_idx").on(table.valueSha256),
        secretVersionUq: uniqueIndex21("company_secret_versions_secret_version_uq").on(table.secretId, table.version)
      })
    );
  }
});

// ../packages/db/src/schema/plugins.ts
import {
  pgTable as pgTable48,
  uuid as uuid47,
  text as text49,
  integer as integer18,
  timestamp as timestamp48,
  jsonb as jsonb25,
  index as index44,
  uniqueIndex as uniqueIndex22
} from "drizzle-orm/pg-core";
var plugins;
var init_plugins = __esm({
  "../packages/db/src/schema/plugins.ts"() {
    "use strict";
    plugins = pgTable48(
      "plugins",
      {
        id: uuid47("id").primaryKey().defaultRandom(),
        pluginKey: text49("plugin_key").notNull(),
        packageName: text49("package_name").notNull(),
        version: text49("version").notNull(),
        apiVersion: integer18("api_version").notNull().default(1),
        categories: jsonb25("categories").$type().notNull().default([]),
        manifestJson: jsonb25("manifest_json").$type().notNull(),
        status: text49("status").$type().notNull().default("installed"),
        installOrder: integer18("install_order"),
        /** Resolved package path for local-path installs; used to find worker entrypoint. */
        packagePath: text49("package_path"),
        lastError: text49("last_error"),
        installedAt: timestamp48("installed_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp48("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        pluginKeyIdx: uniqueIndex22("plugins_plugin_key_idx").on(table.pluginKey),
        statusIdx: index44("plugins_status_idx").on(table.status)
      })
    );
  }
});

// ../packages/db/src/schema/plugin_config.ts
import { pgTable as pgTable49, uuid as uuid48, text as text50, timestamp as timestamp49, jsonb as jsonb26, uniqueIndex as uniqueIndex23 } from "drizzle-orm/pg-core";
var pluginConfig;
var init_plugin_config = __esm({
  "../packages/db/src/schema/plugin_config.ts"() {
    "use strict";
    init_plugins();
    pluginConfig = pgTable49(
      "plugin_config",
      {
        id: uuid48("id").primaryKey().defaultRandom(),
        pluginId: uuid48("plugin_id").notNull().references(() => plugins.id, { onDelete: "cascade" }),
        configJson: jsonb26("config_json").$type().notNull().default({}),
        lastError: text50("last_error"),
        createdAt: timestamp49("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp49("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        pluginIdIdx: uniqueIndex23("plugin_config_plugin_id_idx").on(table.pluginId)
      })
    );
  }
});

// ../packages/db/src/schema/plugin_company_settings.ts
import { pgTable as pgTable50, uuid as uuid49, text as text51, timestamp as timestamp50, jsonb as jsonb27, index as index45, uniqueIndex as uniqueIndex24, boolean as boolean10 } from "drizzle-orm/pg-core";
var pluginCompanySettings;
var init_plugin_company_settings = __esm({
  "../packages/db/src/schema/plugin_company_settings.ts"() {
    "use strict";
    init_companies();
    init_plugins();
    pluginCompanySettings = pgTable50(
      "plugin_company_settings",
      {
        id: uuid49("id").primaryKey().defaultRandom(),
        companyId: uuid49("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
        pluginId: uuid49("plugin_id").notNull().references(() => plugins.id, { onDelete: "cascade" }),
        enabled: boolean10("enabled").notNull().default(true),
        settingsJson: jsonb27("settings_json").$type().notNull().default({}),
        lastError: text51("last_error"),
        createdAt: timestamp50("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp50("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        companyIdx: index45("plugin_company_settings_company_idx").on(table.companyId),
        pluginIdx: index45("plugin_company_settings_plugin_idx").on(table.pluginId),
        companyPluginUq: uniqueIndex24("plugin_company_settings_company_plugin_uq").on(
          table.companyId,
          table.pluginId
        )
      })
    );
  }
});

// ../packages/db/src/schema/plugin_state.ts
import {
  pgTable as pgTable51,
  uuid as uuid50,
  text as text52,
  timestamp as timestamp51,
  jsonb as jsonb28,
  index as index46,
  unique as unique2
} from "drizzle-orm/pg-core";
var pluginState;
var init_plugin_state = __esm({
  "../packages/db/src/schema/plugin_state.ts"() {
    "use strict";
    init_plugins();
    pluginState = pgTable51(
      "plugin_state",
      {
        id: uuid50("id").primaryKey().defaultRandom(),
        /** FK to the owning plugin. Cascades on delete. */
        pluginId: uuid50("plugin_id").notNull().references(() => plugins.id, { onDelete: "cascade" }),
        /** Granularity of the scope (e.g. `"instance"`, `"project"`, `"issue"`). */
        scopeKind: text52("scope_kind").$type().notNull(),
        /**
         * UUID or text identifier for the scoped object.
         * Null for `instance` scope (which has no associated entity).
         */
        scopeId: text52("scope_id"),
        /**
         * Sub-namespace to avoid key collisions within a scope.
         * Defaults to `"default"` if the plugin does not specify one.
         */
        namespace: text52("namespace").notNull().default("default"),
        /** The key identifying this state entry within the namespace. */
        stateKey: text52("state_key").notNull(),
        /** JSON-serializable value stored by the plugin. */
        valueJson: jsonb28("value_json").notNull(),
        /** Timestamp of the most recent write. */
        updatedAt: timestamp51("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        /**
         * Unique constraint enforces that there is at most one value per
         * (plugin, scope kind, scope id, namespace, key) tuple.
         *
         * `nullsNotDistinct()` is required so that `scope_id IS NULL` entries
         * (used by `instance` scope) are treated as equal by PostgreSQL rather
         * than as distinct nulls — otherwise the upsert target in `set()` would
         * fail to match existing rows and create duplicates.
         *
         * Requires PostgreSQL 15+.
         */
        uniqueEntry: unique2("plugin_state_unique_entry_idx").on(
          table.pluginId,
          table.scopeKind,
          table.scopeId,
          table.namespace,
          table.stateKey
        ).nullsNotDistinct(),
        /** Speed up lookups by plugin + scope kind (most common access pattern). */
        pluginScopeIdx: index46("plugin_state_plugin_scope_idx").on(
          table.pluginId,
          table.scopeKind
        )
      })
    );
  }
});

// ../packages/db/src/schema/plugin_entities.ts
import {
  pgTable as pgTable52,
  uuid as uuid51,
  text as text53,
  timestamp as timestamp52,
  jsonb as jsonb29,
  index as index47,
  uniqueIndex as uniqueIndex25
} from "drizzle-orm/pg-core";
var pluginEntities;
var init_plugin_entities = __esm({
  "../packages/db/src/schema/plugin_entities.ts"() {
    "use strict";
    init_plugins();
    pluginEntities = pgTable52(
      "plugin_entities",
      {
        id: uuid51("id").primaryKey().defaultRandom(),
        pluginId: uuid51("plugin_id").notNull().references(() => plugins.id, { onDelete: "cascade" }),
        entityType: text53("entity_type").notNull(),
        scopeKind: text53("scope_kind").$type().notNull(),
        scopeId: text53("scope_id"),
        // NULL for global scope (text to match plugin_state.scope_id)
        externalId: text53("external_id"),
        // ID in the external system
        title: text53("title"),
        status: text53("status"),
        data: jsonb29("data").$type().notNull().default({}),
        createdAt: timestamp52("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp52("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        pluginIdx: index47("plugin_entities_plugin_idx").on(table.pluginId),
        typeIdx: index47("plugin_entities_type_idx").on(table.entityType),
        scopeIdx: index47("plugin_entities_scope_idx").on(table.scopeKind, table.scopeId),
        externalIdx: uniqueIndex25("plugin_entities_external_idx").on(
          table.pluginId,
          table.entityType,
          table.externalId
        )
      })
    );
  }
});

// ../packages/db/src/schema/plugin_jobs.ts
import {
  pgTable as pgTable53,
  uuid as uuid52,
  text as text54,
  integer as integer19,
  timestamp as timestamp53,
  jsonb as jsonb30,
  index as index48,
  uniqueIndex as uniqueIndex26
} from "drizzle-orm/pg-core";
var pluginJobs, pluginJobRuns;
var init_plugin_jobs = __esm({
  "../packages/db/src/schema/plugin_jobs.ts"() {
    "use strict";
    init_plugins();
    pluginJobs = pgTable53(
      "plugin_jobs",
      {
        id: uuid52("id").primaryKey().defaultRandom(),
        /** FK to the owning plugin. Cascades on delete. */
        pluginId: uuid52("plugin_id").notNull().references(() => plugins.id, { onDelete: "cascade" }),
        /** Identifier matching the key in the plugin manifest's `jobs` array. */
        jobKey: text54("job_key").notNull(),
        /** Cron expression (e.g. `"0 * * * *"`) or interval string. */
        schedule: text54("schedule").notNull(),
        /** Current scheduling state. */
        status: text54("status").$type().notNull().default("active"),
        /** Timestamp of the most recent successful execution. */
        lastRunAt: timestamp53("last_run_at", { withTimezone: true }),
        /** Pre-computed timestamp of the next scheduled execution. */
        nextRunAt: timestamp53("next_run_at", { withTimezone: true }),
        createdAt: timestamp53("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp53("updated_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        pluginIdx: index48("plugin_jobs_plugin_idx").on(table.pluginId),
        nextRunIdx: index48("plugin_jobs_next_run_idx").on(table.nextRunAt),
        uniqueJobIdx: uniqueIndex26("plugin_jobs_unique_idx").on(table.pluginId, table.jobKey)
      })
    );
    pluginJobRuns = pgTable53(
      "plugin_job_runs",
      {
        id: uuid52("id").primaryKey().defaultRandom(),
        /** FK to the parent job definition. Cascades on delete. */
        jobId: uuid52("job_id").notNull().references(() => pluginJobs.id, { onDelete: "cascade" }),
        /** Denormalized FK to the owning plugin for efficient querying. Cascades on delete. */
        pluginId: uuid52("plugin_id").notNull().references(() => plugins.id, { onDelete: "cascade" }),
        /** What caused this run to start (`"scheduled"` or `"manual"`). */
        trigger: text54("trigger").$type().notNull(),
        /** Current lifecycle state of this run. */
        status: text54("status").$type().notNull().default("pending"),
        /** Wall-clock duration in milliseconds. Null until the run finishes. */
        durationMs: integer19("duration_ms"),
        /** Error message if `status === "failed"`. */
        error: text54("error"),
        /** Ordered list of log lines emitted during this run. */
        logs: jsonb30("logs").$type().notNull().default([]),
        startedAt: timestamp53("started_at", { withTimezone: true }),
        finishedAt: timestamp53("finished_at", { withTimezone: true }),
        createdAt: timestamp53("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        jobIdx: index48("plugin_job_runs_job_idx").on(table.jobId),
        pluginIdx: index48("plugin_job_runs_plugin_idx").on(table.pluginId),
        statusIdx: index48("plugin_job_runs_status_idx").on(table.status)
      })
    );
  }
});

// ../packages/db/src/schema/plugin_webhooks.ts
import {
  pgTable as pgTable54,
  uuid as uuid53,
  text as text55,
  integer as integer20,
  timestamp as timestamp54,
  jsonb as jsonb31,
  index as index49
} from "drizzle-orm/pg-core";
var pluginWebhookDeliveries;
var init_plugin_webhooks = __esm({
  "../packages/db/src/schema/plugin_webhooks.ts"() {
    "use strict";
    init_plugins();
    pluginWebhookDeliveries = pgTable54(
      "plugin_webhook_deliveries",
      {
        id: uuid53("id").primaryKey().defaultRandom(),
        /** FK to the owning plugin. Cascades on delete. */
        pluginId: uuid53("plugin_id").notNull().references(() => plugins.id, { onDelete: "cascade" }),
        /** Identifier matching the key in the plugin manifest's `webhooks` array. */
        webhookKey: text55("webhook_key").notNull(),
        /** Optional de-duplication ID provided by the external system. */
        externalId: text55("external_id"),
        /** Current delivery state. */
        status: text55("status").$type().notNull().default("pending"),
        /** Wall-clock processing duration in milliseconds. Null until delivery finishes. */
        durationMs: integer20("duration_ms"),
        /** Error message if `status === "failed"`. */
        error: text55("error"),
        /** Raw JSON body of the inbound HTTP request. */
        payload: jsonb31("payload").$type().notNull(),
        /** Relevant HTTP headers from the inbound request (e.g. signature headers). */
        headers: jsonb31("headers").$type().notNull().default({}),
        startedAt: timestamp54("started_at", { withTimezone: true }),
        finishedAt: timestamp54("finished_at", { withTimezone: true }),
        createdAt: timestamp54("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        pluginIdx: index49("plugin_webhook_deliveries_plugin_idx").on(table.pluginId),
        statusIdx: index49("plugin_webhook_deliveries_status_idx").on(table.status),
        keyIdx: index49("plugin_webhook_deliveries_key_idx").on(table.webhookKey)
      })
    );
  }
});

// ../packages/db/src/schema/plugin_logs.ts
import {
  pgTable as pgTable55,
  uuid as uuid54,
  text as text56,
  timestamp as timestamp55,
  jsonb as jsonb32,
  index as index50
} from "drizzle-orm/pg-core";
var pluginLogs;
var init_plugin_logs = __esm({
  "../packages/db/src/schema/plugin_logs.ts"() {
    "use strict";
    init_plugins();
    pluginLogs = pgTable55(
      "plugin_logs",
      {
        id: uuid54("id").primaryKey().defaultRandom(),
        pluginId: uuid54("plugin_id").notNull().references(() => plugins.id, { onDelete: "cascade" }),
        level: text56("level").notNull().default("info"),
        message: text56("message").notNull(),
        meta: jsonb32("meta").$type(),
        createdAt: timestamp55("created_at", { withTimezone: true }).notNull().defaultNow()
      },
      (table) => ({
        pluginTimeIdx: index50("plugin_logs_plugin_time_idx").on(
          table.pluginId,
          table.createdAt
        ),
        levelIdx: index50("plugin_logs_level_idx").on(table.level)
      })
    );
  }
});

// ../packages/db/src/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  activityLog: () => activityLog,
  agentApiKeys: () => agentApiKeys,
  agentConfigRevisions: () => agentConfigRevisions,
  agentRuntimeState: () => agentRuntimeState,
  agentTaskSessions: () => agentTaskSessions,
  agentWakeupRequests: () => agentWakeupRequests,
  agents: () => agents,
  approvalComments: () => approvalComments,
  approvals: () => approvals,
  assets: () => assets,
  authAccounts: () => authAccounts,
  authSessions: () => authSessions,
  authUsers: () => authUsers,
  authVerifications: () => authVerifications,
  budgetIncidents: () => budgetIncidents,
  budgetPolicies: () => budgetPolicies,
  companies: () => companies,
  companyLogos: () => companyLogos,
  companyMemberships: () => companyMemberships,
  companySecretVersions: () => companySecretVersions,
  companySecrets: () => companySecrets,
  costEvents: () => costEvents,
  documentRevisions: () => documentRevisions,
  documents: () => documents,
  executionWorkspaces: () => executionWorkspaces,
  financeEvents: () => financeEvents,
  goals: () => goals,
  heartbeatRunEvents: () => heartbeatRunEvents,
  heartbeatRuns: () => heartbeatRuns,
  instanceSettings: () => instanceSettings,
  instanceUserRoles: () => instanceUserRoles,
  invites: () => invites,
  issueApprovals: () => issueApprovals,
  issueAttachments: () => issueAttachments,
  issueComments: () => issueComments,
  issueDocuments: () => issueDocuments,
  issueLabels: () => issueLabels,
  issueReadStates: () => issueReadStates,
  issueWorkProducts: () => issueWorkProducts,
  issues: () => issues,
  joinRequests: () => joinRequests,
  kbSkillDocs: () => kbSkillDocs,
  labels: () => labels,
  pluginCompanySettings: () => pluginCompanySettings,
  pluginConfig: () => pluginConfig,
  pluginEntities: () => pluginEntities,
  pluginJobRuns: () => pluginJobRuns,
  pluginJobs: () => pluginJobs,
  pluginLogs: () => pluginLogs,
  pluginState: () => pluginState,
  pluginWebhookDeliveries: () => pluginWebhookDeliveries,
  plugins: () => plugins,
  principalPermissionGrants: () => principalPermissionGrants,
  projectGoals: () => projectGoals,
  projectWorkspaces: () => projectWorkspaces,
  projects: () => projects,
  tickets: () => tickets,
  workspaceOperations: () => workspaceOperations,
  workspaceRuntimeServices: () => workspaceRuntimeServices
});
var init_schema2 = __esm({
  "../packages/db/src/schema/index.ts"() {
    "use strict";
    init_companies();
    init_company_logos();
    init_auth();
    init_instance_settings();
    init_instance_user_roles();
    init_agents();
    init_company_memberships();
    init_principal_permission_grants();
    init_invites();
    init_join_requests();
    init_budget_policies();
    init_budget_incidents();
    init_agent_config_revisions();
    init_agent_api_keys();
    init_agent_runtime_state();
    init_agent_task_sessions();
    init_agent_wakeup_requests();
    init_projects();
    init_project_workspaces();
    init_execution_workspaces();
    init_workspace_operations();
    init_workspace_runtime_services();
    init_project_goals();
    init_goals();
    init_tickets();
    init_issues();
    init_issue_work_products();
    init_labels();
    init_issue_labels();
    init_issue_approvals();
    init_issue_comments();
    init_issue_read_states();
    init_assets();
    init_issue_attachments();
    init_documents();
    init_kb_skill_docs();
    init_document_revisions();
    init_issue_documents();
    init_heartbeat_runs();
    init_heartbeat_run_events();
    init_cost_events();
    init_finance_events();
    init_approvals();
    init_approval_comments();
    init_activity_log();
    init_company_secrets();
    init_company_secret_versions();
    init_plugins();
    init_plugin_config();
    init_plugin_company_settings();
    init_plugin_state();
    init_plugin_entities();
    init_plugin_jobs();
    init_plugin_webhooks();
    init_plugin_logs();
  }
});

// ../packages/db/src/client.ts
import { createHash } from "node:crypto";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
function createUtilitySql(url) {
  return postgres(url, { max: 1, onnotice: () => {
  } });
}
function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
function quoteIdentifier(value) {
  if (!isSafeIdentifier(value))
    throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}
function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
function splitMigrationStatements(content) {
  return content.split("--> statement-breakpoint").map((statement) => statement.trim()).filter((statement) => statement.length > 0);
}
function createDb(url) {
  const sql2 = postgres(url);
  return drizzlePg(sql2, { schema: schema_exports });
}
async function getPostgresDataDirectory(url) {
  const sql2 = createUtilitySql(url);
  try {
    const rows = await sql2`
      SELECT current_setting('data_directory', true) AS data_directory
    `;
    const actual = rows[0]?.data_directory;
    return typeof actual === "string" && actual.length > 0 ? actual : null;
  } catch {
    return null;
  } finally {
    await sql2.end();
  }
}
async function listMigrationFiles() {
  const entries = await readdir(MIGRATIONS_FOLDER, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sql")).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}
async function listJournalMigrationEntries() {
  try {
    const raw = await readFile(MIGRATIONS_JOURNAL_JSON, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.entries))
      return [];
    return parsed.entries.map((entry, entryIndex) => {
      if (typeof entry?.tag !== "string")
        return null;
      if (typeof entry?.when !== "number" || !Number.isFinite(entry.when))
        return null;
      const order = Number.isInteger(entry.idx) ? Number(entry.idx) : entryIndex;
      return { fileName: `${entry.tag}.sql`, folderMillis: entry.when, order };
    }).filter((entry) => entry !== null);
  } catch {
    return [];
  }
}
async function listJournalMigrationFiles() {
  const entries = await listJournalMigrationEntries();
  return entries.map((entry) => entry.fileName);
}
async function readMigrationFileContent(migrationFile) {
  return readFile(new URL(`./migrations/${migrationFile}`, import.meta.url), "utf8");
}
async function orderMigrationsByJournal(migrationFiles) {
  const journalEntries = await listJournalMigrationEntries();
  const orderByFileName = new Map(journalEntries.map((entry) => [entry.fileName, entry.order]));
  return [...migrationFiles].sort((left, right) => {
    const leftOrder = orderByFileName.get(left);
    const rightOrder = orderByFileName.get(right);
    if (leftOrder === void 0 && rightOrder === void 0)
      return left.localeCompare(right);
    if (leftOrder === void 0)
      return 1;
    if (rightOrder === void 0)
      return -1;
    if (leftOrder === rightOrder)
      return left.localeCompare(right);
    return leftOrder - rightOrder;
  });
}
async function runInTransaction(sql2, action) {
  await sql2.unsafe("BEGIN");
  try {
    await action();
    await sql2.unsafe("COMMIT");
  } catch (error) {
    try {
      await sql2.unsafe("ROLLBACK");
    } catch {
    }
    throw error;
  }
}
async function latestMigrationCreatedAt(sql2, qualifiedTable) {
  const rows = await sql2.unsafe(
    `SELECT created_at FROM ${qualifiedTable} ORDER BY created_at DESC NULLS LAST LIMIT 1`
  );
  const value = Number(rows[0]?.created_at ?? Number.NaN);
  return Number.isFinite(value) ? value : null;
}
function normalizeFolderMillis(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  return Date.now();
}
async function ensureMigrationJournalTable(sql2) {
  let migrationTableSchema = await discoverMigrationTableSchema(sql2);
  if (!migrationTableSchema) {
    const drizzleSchema = quoteIdentifier("drizzle");
    const migrationTable = quoteIdentifier(DRIZZLE_MIGRATIONS_TABLE);
    await sql2.unsafe(`CREATE SCHEMA IF NOT EXISTS ${drizzleSchema}`);
    await sql2.unsafe(
      `CREATE TABLE IF NOT EXISTS ${drizzleSchema}.${migrationTable} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`
    );
    migrationTableSchema = await discoverMigrationTableSchema(sql2) ?? "drizzle";
  }
  const columnNames = await getMigrationTableColumnNames(sql2, migrationTableSchema);
  return { migrationTableSchema, columnNames };
}
async function migrationHistoryEntryExists(sql2, qualifiedTable, columnNames, migrationFile, hash) {
  const predicates = [];
  if (columnNames.has("hash"))
    predicates.push(`hash = ${quoteLiteral(hash)}`);
  if (columnNames.has("name"))
    predicates.push(`name = ${quoteLiteral(migrationFile)}`);
  if (predicates.length === 0)
    return false;
  const rows = await sql2.unsafe(
    `SELECT 1 AS one FROM ${qualifiedTable} WHERE ${predicates.join(" OR ")} LIMIT 1`
  );
  return rows.length > 0;
}
async function recordMigrationHistoryEntry(sql2, qualifiedTable, columnNames, migrationFile, hash, folderMillis) {
  const insertColumns = [];
  const insertValues = [];
  if (columnNames.has("hash")) {
    insertColumns.push(quoteIdentifier("hash"));
    insertValues.push(quoteLiteral(hash));
  }
  if (columnNames.has("name")) {
    insertColumns.push(quoteIdentifier("name"));
    insertValues.push(quoteLiteral(migrationFile));
  }
  if (columnNames.has("created_at")) {
    const latestCreatedAt = await latestMigrationCreatedAt(sql2, qualifiedTable);
    const createdAt = latestCreatedAt === null ? normalizeFolderMillis(folderMillis) : Math.max(latestCreatedAt + 1, normalizeFolderMillis(folderMillis));
    insertColumns.push(quoteIdentifier("created_at"));
    insertValues.push(quoteLiteral(String(createdAt)));
  }
  if (insertColumns.length === 0)
    return;
  await sql2.unsafe(
    `INSERT INTO ${qualifiedTable} (${insertColumns.join(", ")}) VALUES (${insertValues.join(", ")})`
  );
}
async function applyPendingMigrationsManually(url, pendingMigrations) {
  if (pendingMigrations.length === 0)
    return;
  const orderedPendingMigrations = await orderMigrationsByJournal(pendingMigrations);
  const journalEntries = await listJournalMigrationEntries();
  const folderMillisByFileName = new Map(
    journalEntries.map((entry) => [entry.fileName, normalizeFolderMillis(entry.folderMillis)])
  );
  const sql2 = createUtilitySql(url);
  try {
    const { migrationTableSchema, columnNames } = await ensureMigrationJournalTable(sql2);
    const qualifiedTable = `${quoteIdentifier(migrationTableSchema)}.${quoteIdentifier(DRIZZLE_MIGRATIONS_TABLE)}`;
    for (const migrationFile of orderedPendingMigrations) {
      const migrationContent = await readMigrationFileContent(migrationFile);
      const hash = createHash("sha256").update(migrationContent).digest("hex");
      const existingEntry = await migrationHistoryEntryExists(
        sql2,
        qualifiedTable,
        columnNames,
        migrationFile,
        hash
      );
      if (existingEntry)
        continue;
      await runInTransaction(sql2, async () => {
        for (const statement of splitMigrationStatements(migrationContent)) {
          await sql2.unsafe(statement);
        }
        await recordMigrationHistoryEntry(
          sql2,
          qualifiedTable,
          columnNames,
          migrationFile,
          hash,
          folderMillisByFileName.get(migrationFile) ?? Date.now()
        );
      });
    }
  } finally {
    await sql2.end();
  }
}
async function mapHashesToMigrationFiles(migrationFiles) {
  const mapped = /* @__PURE__ */ new Map();
  await Promise.all(
    migrationFiles.map(async (migrationFile) => {
      const content = await readMigrationFileContent(migrationFile);
      const hash = createHash("sha256").update(content).digest("hex");
      mapped.set(hash, migrationFile);
    })
  );
  return mapped;
}
async function getMigrationTableColumnNames(sql2, migrationTableSchema) {
  const columns = await sql2.unsafe(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = ${quoteLiteral(migrationTableSchema)}
        AND table_name = ${quoteLiteral(DRIZZLE_MIGRATIONS_TABLE)}
    `
  );
  return new Set(columns.map((column) => column.column_name));
}
async function tableExists(sql2, tableName) {
  const rows = await sql2`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}
async function columnExists(sql2, tableName, columnName) {
  const rows = await sql2`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}
async function indexExists(sql2, indexName) {
  const rows = await sql2`
    SELECT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'i'
        AND c.relname = ${indexName}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}
async function constraintExists(sql2, constraintName) {
  const rows = await sql2`
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND c.conname = ${constraintName}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}
async function migrationStatementAlreadyApplied(sql2, statement) {
  const normalized = statement.replace(/\s+/g, " ").trim();
  const createTableMatch = normalized.match(/^CREATE TABLE(?: IF NOT EXISTS)? "([^"]+)"/i);
  if (createTableMatch) {
    return tableExists(sql2, createTableMatch[1]);
  }
  const addColumnMatch = normalized.match(
    /^ALTER TABLE "([^"]+)" ADD COLUMN(?: IF NOT EXISTS)? "([^"]+)"/i
  );
  if (addColumnMatch) {
    return columnExists(sql2, addColumnMatch[1], addColumnMatch[2]);
  }
  const createIndexMatch = normalized.match(/^CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)? "([^"]+)"/i);
  if (createIndexMatch) {
    return indexExists(sql2, createIndexMatch[1]);
  }
  const addConstraintMatch = normalized.match(/^ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)"/i);
  if (addConstraintMatch) {
    return constraintExists(sql2, addConstraintMatch[2]);
  }
  return false;
}
async function migrationContentAlreadyApplied(sql2, migrationContent) {
  const statements = splitMigrationStatements(migrationContent);
  if (statements.length === 0)
    return false;
  for (const statement of statements) {
    const applied = await migrationStatementAlreadyApplied(sql2, statement);
    if (!applied)
      return false;
  }
  return true;
}
async function loadAppliedMigrations(sql2, migrationTableSchema, availableMigrations) {
  const quotedSchema = quoteIdentifier(migrationTableSchema);
  const qualifiedTable = `${quotedSchema}.${quoteIdentifier(DRIZZLE_MIGRATIONS_TABLE)}`;
  const columnNames = await getMigrationTableColumnNames(sql2, migrationTableSchema);
  if (columnNames.has("name")) {
    const rows2 = await sql2.unsafe(`SELECT name FROM ${qualifiedTable} ORDER BY id`);
    return rows2.map((row) => row.name).filter((name) => Boolean(name));
  }
  if (columnNames.has("hash")) {
    const rows2 = await sql2.unsafe(`SELECT hash FROM ${qualifiedTable} ORDER BY id`);
    const hashesToMigrationFiles = await mapHashesToMigrationFiles(availableMigrations);
    const appliedFromHashes = rows2.map((row) => hashesToMigrationFiles.get(row.hash)).filter((name) => Boolean(name));
    if (appliedFromHashes.length > 0) {
      if (appliedFromHashes.length === rows2.length)
        return appliedFromHashes;
      return appliedFromHashes;
    }
    if (columnNames.has("created_at")) {
      const journalEntries = await listJournalMigrationEntries();
      if (journalEntries.length > 0) {
        const lastDbRows = await sql2.unsafe(
          `SELECT created_at FROM ${qualifiedTable} ORDER BY created_at DESC LIMIT 1`
        );
        const lastCreatedAt = Number(lastDbRows[0]?.created_at ?? -1);
        if (Number.isFinite(lastCreatedAt) && lastCreatedAt >= 0) {
          return journalEntries.filter((entry) => availableMigrations.includes(entry.fileName)).filter((entry) => entry.folderMillis <= lastCreatedAt).map((entry) => entry.fileName).slice(0, rows2.length);
        }
      }
    }
  }
  const rows = await sql2.unsafe(`SELECT id FROM ${qualifiedTable} ORDER BY id`);
  const journalMigrationFiles = await listJournalMigrationFiles();
  const appliedFromIds = rows.map((row) => journalMigrationFiles[row.id - 1]).filter((name) => Boolean(name));
  if (appliedFromIds.length > 0)
    return appliedFromIds;
  return availableMigrations.slice(0, Math.max(0, rows.length));
}
async function reconcilePendingMigrationHistory(url) {
  const state = await inspectMigrations(url);
  if (state.status !== "needsMigrations" || state.reason !== "pending-migrations") {
    return { repairedMigrations: [], remainingMigrations: [] };
  }
  const sql2 = createUtilitySql(url);
  const repairedMigrations = [];
  try {
    const journalEntries = await listJournalMigrationEntries();
    const folderMillisByFile = new Map(journalEntries.map((entry) => [entry.fileName, entry.folderMillis]));
    const migrationTableSchema = await discoverMigrationTableSchema(sql2);
    if (!migrationTableSchema) {
      return { repairedMigrations, remainingMigrations: state.pendingMigrations };
    }
    const columnNames = await getMigrationTableColumnNames(sql2, migrationTableSchema);
    const qualifiedTable = `${quoteIdentifier(migrationTableSchema)}.${quoteIdentifier(DRIZZLE_MIGRATIONS_TABLE)}`;
    for (const migrationFile of state.pendingMigrations) {
      const migrationContent = await readMigrationFileContent(migrationFile);
      const alreadyApplied = await migrationContentAlreadyApplied(sql2, migrationContent);
      if (!alreadyApplied)
        break;
      const hash = createHash("sha256").update(migrationContent).digest("hex");
      const folderMillis = folderMillisByFile.get(migrationFile) ?? Date.now();
      const existingByHash = columnNames.has("hash") ? await sql2.unsafe(
        `SELECT created_at FROM ${qualifiedTable} WHERE hash = ${quoteLiteral(hash)} ORDER BY created_at DESC LIMIT 1`
      ) : [];
      const existingByName = columnNames.has("name") ? await sql2.unsafe(
        `SELECT created_at FROM ${qualifiedTable} WHERE name = ${quoteLiteral(migrationFile)} ORDER BY created_at DESC LIMIT 1`
      ) : [];
      if (existingByHash.length > 0 || existingByName.length > 0) {
        if (columnNames.has("created_at")) {
          const existingHashCreatedAt = Number(existingByHash[0]?.created_at ?? -1);
          if (existingByHash.length > 0 && Number.isFinite(existingHashCreatedAt) && existingHashCreatedAt < folderMillis) {
            await sql2.unsafe(
              `UPDATE ${qualifiedTable} SET created_at = ${quoteLiteral(String(folderMillis))} WHERE hash = ${quoteLiteral(hash)} AND created_at < ${quoteLiteral(String(folderMillis))}`
            );
          }
          const existingNameCreatedAt = Number(existingByName[0]?.created_at ?? -1);
          if (existingByName.length > 0 && Number.isFinite(existingNameCreatedAt) && existingNameCreatedAt < folderMillis) {
            await sql2.unsafe(
              `UPDATE ${qualifiedTable} SET created_at = ${quoteLiteral(String(folderMillis))} WHERE name = ${quoteLiteral(migrationFile)} AND created_at < ${quoteLiteral(String(folderMillis))}`
            );
          }
        }
        repairedMigrations.push(migrationFile);
        continue;
      }
      const insertColumns = [];
      const insertValues = [];
      if (columnNames.has("hash")) {
        insertColumns.push(quoteIdentifier("hash"));
        insertValues.push(quoteLiteral(hash));
      }
      if (columnNames.has("name")) {
        insertColumns.push(quoteIdentifier("name"));
        insertValues.push(quoteLiteral(migrationFile));
      }
      if (columnNames.has("created_at")) {
        insertColumns.push(quoteIdentifier("created_at"));
        insertValues.push(quoteLiteral(String(folderMillis)));
      }
      if (insertColumns.length === 0)
        break;
      await sql2.unsafe(
        `INSERT INTO ${qualifiedTable} (${insertColumns.join(", ")}) VALUES (${insertValues.join(", ")})`
      );
      repairedMigrations.push(migrationFile);
    }
  } finally {
    await sql2.end();
  }
  const refreshed = await inspectMigrations(url);
  return {
    repairedMigrations,
    remainingMigrations: refreshed.status === "needsMigrations" ? refreshed.pendingMigrations : []
  };
}
async function discoverMigrationTableSchema(sql2) {
  const rows = await sql2`
    SELECT n.nspname AS "schemaName"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = ${DRIZZLE_MIGRATIONS_TABLE} AND c.relkind = 'r'
  `;
  if (rows.length === 0)
    return null;
  const drizzleSchema = rows.find(({ schemaName }) => schemaName === "drizzle");
  if (drizzleSchema)
    return drizzleSchema.schemaName;
  const publicSchema = rows.find(({ schemaName }) => schemaName === "public");
  if (publicSchema)
    return publicSchema.schemaName;
  return rows[0]?.schemaName ?? null;
}
async function inspectMigrations(url) {
  const sql2 = createUtilitySql(url);
  try {
    const availableMigrations = await listMigrationFiles();
    const tableCountResult = await sql2`
      select count(*)::int as count
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
    `;
    const tableCount = tableCountResult[0]?.count ?? 0;
    const migrationTableSchema = await discoverMigrationTableSchema(sql2);
    if (!migrationTableSchema) {
      if (tableCount > 0) {
        return {
          status: "needsMigrations",
          tableCount,
          availableMigrations,
          appliedMigrations: [],
          pendingMigrations: availableMigrations,
          reason: "no-migration-journal-non-empty-db"
        };
      }
      return {
        status: "needsMigrations",
        tableCount,
        availableMigrations,
        appliedMigrations: [],
        pendingMigrations: availableMigrations,
        reason: "no-migration-journal-empty-db"
      };
    }
    const appliedMigrations = await loadAppliedMigrations(sql2, migrationTableSchema, availableMigrations);
    const pendingMigrations = availableMigrations.filter((name) => !appliedMigrations.includes(name));
    if (pendingMigrations.length === 0) {
      return {
        status: "upToDate",
        tableCount,
        availableMigrations,
        appliedMigrations
      };
    }
    return {
      status: "needsMigrations",
      tableCount,
      availableMigrations,
      appliedMigrations,
      pendingMigrations,
      reason: "pending-migrations"
    };
  } finally {
    await sql2.end();
  }
}
async function applyPendingMigrations(url) {
  const initialState = await inspectMigrations(url);
  if (initialState.status === "upToDate")
    return;
  if (initialState.reason === "no-migration-journal-empty-db") {
    const sql2 = createUtilitySql(url);
    try {
      const db = drizzlePg(sql2);
      await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await sql2.end();
    }
    const bootstrappedState = await inspectMigrations(url);
    if (bootstrappedState.status === "upToDate")
      return;
    throw new Error(
      `Failed to bootstrap migrations: ${bootstrappedState.pendingMigrations.join(", ")}`
    );
  }
  if (initialState.reason === "no-migration-journal-non-empty-db") {
    throw new Error(
      "Database has tables but no migration journal; automatic migration is unsafe. Initialize migration history manually."
    );
  }
  let state = await inspectMigrations(url);
  if (state.status === "upToDate")
    return;
  const repair = await reconcilePendingMigrationHistory(url);
  if (repair.repairedMigrations.length > 0) {
    state = await inspectMigrations(url);
    if (state.status === "upToDate")
      return;
  }
  if (state.status !== "needsMigrations" || state.reason !== "pending-migrations") {
    throw new Error("Migrations are still pending after migration-history reconciliation; run inspectMigrations for details.");
  }
  await applyPendingMigrationsManually(url, state.pendingMigrations);
  const finalState = await inspectMigrations(url);
  if (finalState.status !== "upToDate") {
    throw new Error(
      `Failed to apply pending migrations: ${finalState.pendingMigrations.join(", ")}`
    );
  }
}
async function migratePostgresIfEmpty(url) {
  const sql2 = createUtilitySql(url);
  try {
    const migrationTableSchema = await discoverMigrationTableSchema(sql2);
    const tableCountResult = await sql2`
      select count(*)::int as count
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
    `;
    const tableCount = tableCountResult[0]?.count ?? 0;
    if (migrationTableSchema) {
      return { migrated: false, reason: "already-migrated", tableCount };
    }
    if (tableCount > 0) {
      return { migrated: false, reason: "not-empty-no-migration-journal", tableCount };
    }
    const db = drizzlePg(sql2);
    await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return { migrated: true, reason: "migrated-empty-db", tableCount: 0 };
  } finally {
    await sql2.end();
  }
}
async function ensurePostgresDatabase(url, databaseName) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(databaseName)) {
    throw new Error(`Unsafe database name: ${databaseName}`);
  }
  const sql2 = createUtilitySql(url);
  try {
    const existing = await sql2`
      select 1 as one from pg_database where datname = ${databaseName} limit 1
    `;
    if (existing.length > 0)
      return "exists";
    await sql2.unsafe(`create database "${databaseName}" encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`);
    return "created";
  } finally {
    await sql2.end();
  }
}
var MIGRATIONS_FOLDER, DRIZZLE_MIGRATIONS_TABLE, MIGRATIONS_JOURNAL_JSON;
var init_client = __esm({
  "../packages/db/src/client.ts"() {
    "use strict";
    init_schema2();
    MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url));
    DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";
    MIGRATIONS_JOURNAL_JSON = fileURLToPath(new URL("./migrations/meta/_journal.json", import.meta.url));
  }
});

// ../packages/db/src/backup-lib.ts
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { readFile as readFile2, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import postgres2 from "postgres";
function sanitizeRestoreErrorMessage(error) {
  if (error && typeof error === "object") {
    const record = error;
    const firstLine = typeof record.message === "string" ? record.message.split(/\r?\n/, 1)[0]?.trim() : "";
    const detail = typeof record.detail === "string" ? record.detail.trim() : "";
    const severity = typeof record.severity === "string" ? record.severity.trim() : "";
    const message = firstLine || detail || (error instanceof Error ? error.message : String(error));
    return severity ? `${severity}: ${message}` : message;
  }
  return error instanceof Error ? error.message : String(error);
}
function timestamp56(date2 = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date2.getFullYear()}${pad(date2.getMonth() + 1)}${pad(date2.getDate())}-${pad(date2.getHours())}${pad(date2.getMinutes())}${pad(date2.getSeconds())}`;
}
function pruneOldBackups(backupDir, retentionDays, filenamePrefix) {
  if (!existsSync(backupDir))
    return 0;
  const safeRetention = Math.max(1, Math.trunc(retentionDays));
  const cutoff = Date.now() - safeRetention * 24 * 60 * 60 * 1e3;
  let pruned = 0;
  for (const name of readdirSync(backupDir)) {
    if (!name.startsWith(`${filenamePrefix}-`) || !name.endsWith(".sql"))
      continue;
    const fullPath = resolve(backupDir, name);
    const stat2 = statSync(fullPath);
    if (stat2.mtimeMs < cutoff) {
      unlinkSync(fullPath);
      pruned++;
    }
  }
  return pruned;
}
function formatBackupSize(sizeBytes) {
  if (sizeBytes < 1024)
    return `${sizeBytes}B`;
  if (sizeBytes < 1024 * 1024)
    return `${(sizeBytes / 1024).toFixed(1)}K`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)}M`;
}
function formatSqlLiteral(value) {
  const sanitized = value.replace(/\u0000/g, "");
  let tag = "$paperclip$";
  while (sanitized.includes(tag)) {
    tag = `$paperclip_${Math.random().toString(36).slice(2, 8)}$`;
  }
  return `${tag}${sanitized}${tag}`;
}
function normalizeTableNameSet(values) {
  return new Set(
    (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0)
  );
}
function normalizeNullifyColumnMap(values) {
  const out = /* @__PURE__ */ new Map();
  if (!values)
    return out;
  for (const [tableName, columns] of Object.entries(values)) {
    const normalizedTable = tableName.trim();
    if (normalizedTable.length === 0)
      continue;
    const normalizedColumns = new Set(
      columns.map((column) => column.trim()).filter((column) => column.length > 0)
    );
    if (normalizedColumns.size > 0) {
      out.set(normalizedTable, normalizedColumns);
    }
  }
  return out;
}
function quoteIdentifier2(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
function quoteQualifiedName(schemaName, objectName) {
  return `${quoteIdentifier2(schemaName)}.${quoteIdentifier2(objectName)}`;
}
function tableKey(schemaName, tableName) {
  return `${schemaName}.${tableName}`;
}
async function runDatabaseBackup(opts) {
  const filenamePrefix = opts.filenamePrefix ?? "paperclip";
  const retentionDays = Math.max(1, Math.trunc(opts.retentionDays));
  const connectTimeout = Math.max(1, Math.trunc(opts.connectTimeoutSeconds ?? 5));
  const includeMigrationJournal = opts.includeMigrationJournal === true;
  const excludedTableNames = normalizeTableNameSet(opts.excludeTables);
  const nullifiedColumnsByTable = normalizeNullifyColumnMap(opts.nullifyColumns);
  const sql2 = postgres2(opts.connectionString, { max: 1, connect_timeout: connectTimeout });
  try {
    await sql2`SELECT 1`;
    const lines = [];
    const emit = (line) => lines.push(line);
    const emitStatement = (statement) => {
      emit(statement);
      emit(STATEMENT_BREAKPOINT);
    };
    const emitStatementBoundary = () => {
      emit(STATEMENT_BREAKPOINT);
    };
    emit("-- Paperclip database backup");
    emit(`-- Created: ${(/* @__PURE__ */ new Date()).toISOString()}`);
    emit("");
    emitStatement("BEGIN;");
    emitStatement("SET LOCAL session_replication_role = replica;");
    emitStatement("SET LOCAL client_min_messages = warning;");
    emit("");
    const allTables = await sql2`
      SELECT table_schema AS schema_name, table_name AS tablename
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND (
          table_schema = 'public'
          OR (${includeMigrationJournal}::boolean AND table_schema = ${DRIZZLE_SCHEMA} AND table_name = ${DRIZZLE_MIGRATIONS_TABLE2})
        )
      ORDER BY table_schema, table_name
    `;
    const tables = allTables;
    const includedTableNames = new Set(tables.map(({ schema_name, tablename }) => tableKey(schema_name, tablename)));
    const enums = await sql2`
      SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname
    `;
    for (const e of enums) {
      const labels2 = e.labels.map((l) => `'${l.replace(/'/g, "''")}'`).join(", ");
      emitStatement(`CREATE TYPE "public"."${e.typname}" AS ENUM (${labels2});`);
    }
    if (enums.length > 0)
      emit("");
    const allSequences = await sql2`
      SELECT
        s.sequence_schema,
        s.sequence_name,
        s.data_type,
        s.start_value,
        s.minimum_value,
        s.maximum_value,
        s.increment,
        s.cycle_option,
        tblns.nspname AS owner_schema,
        tbl.relname AS owner_table,
        attr.attname AS owner_column
      FROM information_schema.sequences s
      JOIN pg_class seq ON seq.relname = s.sequence_name
      JOIN pg_namespace n ON n.oid = seq.relnamespace AND n.nspname = s.sequence_schema
      LEFT JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype = 'a'
      LEFT JOIN pg_class tbl ON tbl.oid = dep.refobjid
      LEFT JOIN pg_namespace tblns ON tblns.oid = tbl.relnamespace
      LEFT JOIN pg_attribute attr ON attr.attrelid = tbl.oid AND attr.attnum = dep.refobjsubid
      WHERE s.sequence_schema = 'public'
         OR (${includeMigrationJournal}::boolean AND s.sequence_schema = ${DRIZZLE_SCHEMA})
      ORDER BY s.sequence_schema, s.sequence_name
    `;
    const sequences = allSequences.filter(
      (seq) => !seq.owner_table || includedTableNames.has(tableKey(seq.owner_schema ?? "public", seq.owner_table))
    );
    const schemas = /* @__PURE__ */ new Set();
    for (const table of tables)
      schemas.add(table.schema_name);
    for (const seq of sequences)
      schemas.add(seq.sequence_schema);
    const extraSchemas = [...schemas].filter((schemaName) => schemaName !== "public");
    if (extraSchemas.length > 0) {
      emit("-- Schemas");
      for (const schemaName of extraSchemas) {
        emitStatement(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier2(schemaName)};`);
      }
      emit("");
    }
    if (sequences.length > 0) {
      emit("-- Sequences");
      for (const seq of sequences) {
        const qualifiedSequenceName = quoteQualifiedName(seq.sequence_schema, seq.sequence_name);
        emitStatement(`DROP SEQUENCE IF EXISTS ${qualifiedSequenceName} CASCADE;`);
        emitStatement(
          `CREATE SEQUENCE ${qualifiedSequenceName} AS ${seq.data_type} INCREMENT BY ${seq.increment} MINVALUE ${seq.minimum_value} MAXVALUE ${seq.maximum_value} START WITH ${seq.start_value}${seq.cycle_option === "YES" ? " CYCLE" : " NO CYCLE"};`
        );
      }
      emit("");
    }
    for (const { schema_name, tablename } of tables) {
      const qualifiedTableName = quoteQualifiedName(schema_name, tablename);
      const columns = await sql2`
        SELECT column_name, data_type, udt_name, is_nullable, column_default,
               character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = ${schema_name} AND table_name = ${tablename}
        ORDER BY ordinal_position
      `;
      emit(`-- Table: ${schema_name}.${tablename}`);
      emitStatement(`DROP TABLE IF EXISTS ${qualifiedTableName} CASCADE;`);
      const colDefs = [];
      for (const col of columns) {
        let typeStr;
        if (col.data_type === "USER-DEFINED") {
          typeStr = `"${col.udt_name}"`;
        } else if (col.data_type === "ARRAY") {
          typeStr = `${col.udt_name.replace(/^_/, "")}[]`;
        } else if (col.data_type === "character varying") {
          typeStr = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : "varchar";
        } else if (col.data_type === "numeric" && col.numeric_precision != null) {
          typeStr = col.numeric_scale != null ? `numeric(${col.numeric_precision}, ${col.numeric_scale})` : `numeric(${col.numeric_precision})`;
        } else {
          typeStr = col.data_type;
        }
        let def = `  "${col.column_name}" ${typeStr}`;
        if (col.column_default != null)
          def += ` DEFAULT ${col.column_default}`;
        if (col.is_nullable === "NO")
          def += " NOT NULL";
        colDefs.push(def);
      }
      const pk = await sql2`
        SELECT c.conname AS constraint_name,
               array_agg(a.attname ORDER BY array_position(c.conkey, a.attnum)) AS column_names
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE n.nspname = ${schema_name} AND t.relname = ${tablename} AND c.contype = 'p'
        GROUP BY c.conname
      `;
      for (const p25 of pk) {
        const cols = p25.column_names.map((c) => `"${c}"`).join(", ");
        colDefs.push(`  CONSTRAINT "${p25.constraint_name}" PRIMARY KEY (${cols})`);
      }
      emit(`CREATE TABLE ${qualifiedTableName} (`);
      emit(colDefs.join(",\n"));
      emit(");");
      emitStatementBoundary();
      emit("");
    }
    const ownedSequences = sequences.filter((seq) => seq.owner_table && seq.owner_column);
    if (ownedSequences.length > 0) {
      emit("-- Sequence ownership");
      for (const seq of ownedSequences) {
        emitStatement(
          `ALTER SEQUENCE ${quoteQualifiedName(seq.sequence_schema, seq.sequence_name)} OWNED BY ${quoteQualifiedName(seq.owner_schema ?? "public", seq.owner_table)}.${quoteIdentifier2(seq.owner_column)};`
        );
      }
      emit("");
    }
    const allForeignKeys = await sql2`
      SELECT
        c.conname AS constraint_name,
        srcn.nspname AS source_schema,
        src.relname AS source_table,
        array_agg(sa.attname ORDER BY array_position(c.conkey, sa.attnum)) AS source_columns,
        tgtn.nspname AS target_schema,
        tgt.relname AS target_table,
        array_agg(ta.attname ORDER BY array_position(c.confkey, ta.attnum)) AS target_columns,
        CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS update_rule,
        CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS delete_rule
      FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_namespace srcn ON srcn.oid = src.relnamespace
      JOIN pg_class tgt ON tgt.oid = c.confrelid
      JOIN pg_namespace tgtn ON tgtn.oid = tgt.relnamespace
      JOIN pg_attribute sa ON sa.attrelid = src.oid AND sa.attnum = ANY(c.conkey)
      JOIN pg_attribute ta ON ta.attrelid = tgt.oid AND ta.attnum = ANY(c.confkey)
      WHERE c.contype = 'f' AND (
        srcn.nspname = 'public'
        OR (${includeMigrationJournal}::boolean AND srcn.nspname = ${DRIZZLE_SCHEMA})
      )
      GROUP BY c.conname, srcn.nspname, src.relname, tgtn.nspname, tgt.relname, c.confupdtype, c.confdeltype
      ORDER BY srcn.nspname, src.relname, c.conname
    `;
    const fks = allForeignKeys.filter(
      (fk) => includedTableNames.has(tableKey(fk.source_schema, fk.source_table)) && includedTableNames.has(tableKey(fk.target_schema, fk.target_table))
    );
    if (fks.length > 0) {
      emit("-- Foreign keys");
      for (const fk of fks) {
        const srcCols = fk.source_columns.map((c) => `"${c}"`).join(", ");
        const tgtCols = fk.target_columns.map((c) => `"${c}"`).join(", ");
        emitStatement(
          `ALTER TABLE ${quoteQualifiedName(fk.source_schema, fk.source_table)} ADD CONSTRAINT "${fk.constraint_name}" FOREIGN KEY (${srcCols}) REFERENCES ${quoteQualifiedName(fk.target_schema, fk.target_table)} (${tgtCols}) ON UPDATE ${fk.update_rule} ON DELETE ${fk.delete_rule};`
        );
      }
      emit("");
    }
    const allUniqueConstraints = await sql2`
      SELECT c.conname AS constraint_name,
             n.nspname AS schema_name,
             t.relname AS tablename,
             array_agg(a.attname ORDER BY array_position(c.conkey, a.attnum)) AS column_names
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'u' AND (
        n.nspname = 'public'
        OR (${includeMigrationJournal}::boolean AND n.nspname = ${DRIZZLE_SCHEMA})
      )
      GROUP BY c.conname, n.nspname, t.relname
      ORDER BY n.nspname, t.relname, c.conname
    `;
    const uniques = allUniqueConstraints.filter((entry) => includedTableNames.has(tableKey(entry.schema_name, entry.tablename)));
    if (uniques.length > 0) {
      emit("-- Unique constraints");
      for (const u of uniques) {
        const cols = u.column_names.map((c) => `"${c}"`).join(", ");
        emitStatement(`ALTER TABLE ${quoteQualifiedName(u.schema_name, u.tablename)} ADD CONSTRAINT "${u.constraint_name}" UNIQUE (${cols});`);
      }
      emit("");
    }
    const allIndexes = await sql2`
      SELECT schemaname AS schema_name, tablename, indexdef
      FROM pg_indexes
      WHERE (
          schemaname = 'public'
          OR (${includeMigrationJournal}::boolean AND schemaname = ${DRIZZLE_SCHEMA})
        )
        AND indexname NOT IN (
          SELECT conname FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE n.nspname = pg_indexes.schemaname
        )
      ORDER BY schemaname, tablename, indexname
    `;
    const indexes = allIndexes.filter((entry) => includedTableNames.has(tableKey(entry.schema_name, entry.tablename)));
    if (indexes.length > 0) {
      emit("-- Indexes");
      for (const idx of indexes) {
        emitStatement(`${idx.indexdef};`);
      }
      emit("");
    }
    for (const { schema_name, tablename } of tables) {
      const qualifiedTableName = quoteQualifiedName(schema_name, tablename);
      const count = await sql2.unsafe(`SELECT count(*)::int AS n FROM ${qualifiedTableName}`);
      if (excludedTableNames.has(tablename) || (count[0]?.n ?? 0) === 0)
        continue;
      const cols = await sql2`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = ${schema_name} AND table_name = ${tablename}
        ORDER BY ordinal_position
      `;
      const colNames = cols.map((c) => `"${c.column_name}"`).join(", ");
      emit(`-- Data for: ${schema_name}.${tablename} (${count[0].n} rows)`);
      const rows = await sql2.unsafe(`SELECT * FROM ${qualifiedTableName}`).values();
      const nullifiedColumns = nullifiedColumnsByTable.get(tablename) ?? /* @__PURE__ */ new Set();
      for (const row of rows) {
        const values = row.map((rawValue, index51) => {
          const columnName = cols[index51]?.column_name;
          const val = columnName && nullifiedColumns.has(columnName) ? null : rawValue;
          if (val === null || val === void 0)
            return "NULL";
          if (typeof val === "boolean")
            return val ? "true" : "false";
          if (typeof val === "number")
            return String(val);
          if (val instanceof Date)
            return formatSqlLiteral(val.toISOString());
          if (typeof val === "object")
            return formatSqlLiteral(JSON.stringify(val));
          return formatSqlLiteral(String(val));
        });
        emitStatement(`INSERT INTO ${qualifiedTableName} (${colNames}) VALUES (${values.join(", ")});`);
      }
      emit("");
    }
    if (sequences.length > 0) {
      emit("-- Sequence values");
      for (const seq of sequences) {
        const qualifiedSequenceName = quoteQualifiedName(seq.sequence_schema, seq.sequence_name);
        const val = await sql2.unsafe(
          `SELECT last_value::text, is_called FROM ${qualifiedSequenceName}`
        );
        const skipSequenceValue = seq.owner_table !== null && excludedTableNames.has(seq.owner_table);
        if (val[0] && !skipSequenceValue) {
          emitStatement(`SELECT setval('${qualifiedSequenceName.replaceAll("'", "''")}', ${val[0].last_value}, ${val[0].is_called ? "true" : "false"});`);
        }
      }
      emit("");
    }
    emitStatement("COMMIT;");
    emit("");
    mkdirSync(opts.backupDir, { recursive: true });
    const backupFile = resolve(opts.backupDir, `${filenamePrefix}-${timestamp56()}.sql`);
    await writeFile(backupFile, lines.join("\n"), "utf8");
    const sizeBytes = statSync(backupFile).size;
    const prunedCount = pruneOldBackups(opts.backupDir, retentionDays, filenamePrefix);
    return {
      backupFile,
      sizeBytes,
      prunedCount
    };
  } finally {
    await sql2.end();
  }
}
async function runDatabaseRestore(opts) {
  const connectTimeout = Math.max(1, Math.trunc(opts.connectTimeoutSeconds ?? 5));
  const sql2 = postgres2(opts.connectionString, { max: 1, connect_timeout: connectTimeout });
  try {
    await sql2`SELECT 1`;
    const contents = await readFile2(opts.backupFile, "utf8");
    const statements = contents.split(STATEMENT_BREAKPOINT).map((statement) => statement.trim()).filter((statement) => statement.length > 0);
    for (const statement of statements) {
      await sql2.unsafe(statement).execute();
    }
  } catch (error) {
    const statementPreview = typeof error === "object" && error !== null && typeof error.query === "string" ? String(error.query).split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0 && !line.startsWith("--")) : null;
    throw new Error(
      `Failed to restore ${basename(opts.backupFile)}: ${sanitizeRestoreErrorMessage(error)}${statementPreview ? ` [statement: ${statementPreview.slice(0, 120)}]` : ""}`
    );
  } finally {
    await sql2.end();
  }
}
function formatDatabaseBackupResult(result) {
  const size = formatBackupSize(result.sizeBytes);
  const pruned = result.prunedCount > 0 ? `; pruned ${result.prunedCount} old backup(s)` : "";
  return `${result.backupFile} (${size}${pruned})`;
}
var DRIZZLE_SCHEMA, DRIZZLE_MIGRATIONS_TABLE2, STATEMENT_BREAKPOINT;
var init_backup_lib = __esm({
  "../packages/db/src/backup-lib.ts"() {
    "use strict";
    DRIZZLE_SCHEMA = "drizzle";
    DRIZZLE_MIGRATIONS_TABLE2 = "__drizzle_migrations";
    STATEMENT_BREAKPOINT = "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900";
  }
});

// ../packages/db/src/index.ts
var src_exports = {};
__export(src_exports, {
  activityLog: () => activityLog,
  agentApiKeys: () => agentApiKeys,
  agentConfigRevisions: () => agentConfigRevisions,
  agentRuntimeState: () => agentRuntimeState,
  agentTaskSessions: () => agentTaskSessions,
  agentWakeupRequests: () => agentWakeupRequests,
  agents: () => agents,
  applyPendingMigrations: () => applyPendingMigrations,
  approvalComments: () => approvalComments,
  approvals: () => approvals,
  assets: () => assets,
  authAccounts: () => authAccounts,
  authSessions: () => authSessions,
  authUsers: () => authUsers,
  authVerifications: () => authVerifications,
  budgetIncidents: () => budgetIncidents,
  budgetPolicies: () => budgetPolicies,
  companies: () => companies,
  companyLogos: () => companyLogos,
  companyMemberships: () => companyMemberships,
  companySecretVersions: () => companySecretVersions,
  companySecrets: () => companySecrets,
  costEvents: () => costEvents,
  createDb: () => createDb,
  documentRevisions: () => documentRevisions,
  documents: () => documents,
  ensurePostgresDatabase: () => ensurePostgresDatabase,
  executionWorkspaces: () => executionWorkspaces,
  financeEvents: () => financeEvents,
  formatDatabaseBackupResult: () => formatDatabaseBackupResult,
  getPostgresDataDirectory: () => getPostgresDataDirectory,
  goals: () => goals,
  heartbeatRunEvents: () => heartbeatRunEvents,
  heartbeatRuns: () => heartbeatRuns,
  inspectMigrations: () => inspectMigrations,
  instanceSettings: () => instanceSettings,
  instanceUserRoles: () => instanceUserRoles,
  invites: () => invites,
  issueApprovals: () => issueApprovals,
  issueAttachments: () => issueAttachments,
  issueComments: () => issueComments,
  issueDocuments: () => issueDocuments,
  issueLabels: () => issueLabels,
  issueReadStates: () => issueReadStates,
  issueWorkProducts: () => issueWorkProducts,
  issues: () => issues,
  joinRequests: () => joinRequests,
  kbSkillDocs: () => kbSkillDocs,
  labels: () => labels,
  migratePostgresIfEmpty: () => migratePostgresIfEmpty,
  pluginCompanySettings: () => pluginCompanySettings,
  pluginConfig: () => pluginConfig,
  pluginEntities: () => pluginEntities,
  pluginJobRuns: () => pluginJobRuns,
  pluginJobs: () => pluginJobs,
  pluginLogs: () => pluginLogs,
  pluginState: () => pluginState,
  pluginWebhookDeliveries: () => pluginWebhookDeliveries,
  plugins: () => plugins,
  principalPermissionGrants: () => principalPermissionGrants,
  projectGoals: () => projectGoals,
  projectWorkspaces: () => projectWorkspaces,
  projects: () => projects,
  reconcilePendingMigrationHistory: () => reconcilePendingMigrationHistory,
  runDatabaseBackup: () => runDatabaseBackup,
  runDatabaseRestore: () => runDatabaseRestore,
  tickets: () => tickets,
  workspaceOperations: () => workspaceOperations,
  workspaceRuntimeServices: () => workspaceRuntimeServices
});
var init_src2 = __esm({
  "../packages/db/src/index.ts"() {
    "use strict";
    init_client();
    init_backup_lib();
    init_schema2();
  }
});

// src/commands/auth-bootstrap-ceo.ts
import { createHash as createHash2, randomBytes as randomBytes3 } from "node:crypto";
import * as p7 from "@clack/prompts";
import pc from "picocolors";
import { and, eq, gt, isNull } from "drizzle-orm";
function hashToken(token) {
  return createHash2("sha256").update(token).digest("hex");
}
function createInviteToken() {
  return `pcp_bootstrap_${randomBytes3(24).toString("hex")}`;
}
function resolveDbUrl(configPath, explicitDbUrl) {
  if (explicitDbUrl)
    return explicitDbUrl;
  const config = readConfig(configPath);
  if (process.env.DATABASE_URL)
    return process.env.DATABASE_URL;
  if (config?.database.mode === "postgres" && config.database.connectionString) {
    return config.database.connectionString;
  }
  if (config?.database.mode === "embedded-postgres") {
    const port = config.database.embeddedPostgresPort ?? 54329;
    return `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
  }
  return null;
}
function resolveBaseUrl(configPath, explicitBaseUrl) {
  if (explicitBaseUrl)
    return explicitBaseUrl.replace(/\/+$/, "");
  const fromEnv = process.env.PAPERCLIP_PUBLIC_URL ?? process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL ?? process.env.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_BASE_URL;
  if (fromEnv?.trim())
    return fromEnv.trim().replace(/\/+$/, "");
  const config = readConfig(configPath);
  if (config?.auth.baseUrlMode === "explicit" && config.auth.publicBaseUrl) {
    return config.auth.publicBaseUrl.replace(/\/+$/, "");
  }
  const host = config?.server.host ?? "localhost";
  const port = config?.server.port ?? 3100;
  const publicHost = host === "0.0.0.0" ? "localhost" : host;
  return `http://${publicHost}:${port}`;
}
async function bootstrapCeoInvite(opts) {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);
  const config = readConfig(configPath);
  if (!config) {
    p7.log.error(`No config found at ${configPath}. Run ${pc.cyan("growthub onboard")} first.`);
    return;
  }
  if (config.server.deploymentMode !== "authenticated") {
    p7.log.info("Deployment mode is local_trusted. Bootstrap CEO invite is only required for authenticated mode.");
    return;
  }
  const dbUrl = resolveDbUrl(configPath, opts.dbUrl);
  if (!dbUrl) {
    p7.log.error(
      "Could not resolve database connection for bootstrap."
    );
    return;
  }
  const db = createDb(dbUrl);
  const closableDb = db;
  try {
    const existingAdminCount = await db.select().from(instanceUserRoles).where(eq(instanceUserRoles.role, "instance_admin")).then((rows) => rows.length);
    if (existingAdminCount > 0 && !opts.force) {
      p7.log.info("Instance already has an admin user. Use --force to generate a new bootstrap invite.");
      return;
    }
    const now = /* @__PURE__ */ new Date();
    await db.update(invites).set({ revokedAt: now, updatedAt: now }).where(
      and(
        eq(invites.inviteType, "bootstrap_ceo"),
        isNull(invites.revokedAt),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, now)
      )
    );
    const token = createInviteToken();
    const expiresHours = Math.max(1, Math.min(24 * 30, opts.expiresHours ?? 72));
    const created = await db.insert(invites).values({
      inviteType: "bootstrap_ceo",
      tokenHash: hashToken(token),
      allowedJoinTypes: "human",
      expiresAt: new Date(Date.now() + expiresHours * 60 * 60 * 1e3),
      invitedByUserId: "system"
    }).returning().then((rows) => rows[0]);
    const baseUrl = resolveBaseUrl(configPath, opts.baseUrl);
    const inviteUrl = `${baseUrl}/invite/${token}`;
    p7.log.success("Created bootstrap CEO invite.");
    p7.log.message(`Invite URL: ${pc.cyan(inviteUrl)}`);
    p7.log.message(`Expires: ${pc.dim(created.expiresAt.toISOString())}`);
  } catch (err) {
    p7.log.error(`Could not create bootstrap invite: ${err instanceof Error ? err.message : String(err)}`);
    p7.log.info("If using embedded-postgres, start the Growthub server and run this command again.");
  } finally {
    await closableDb.$client?.end?.({ timeout: 5 }).catch(() => void 0);
  }
}
var init_auth_bootstrap_ceo = __esm({
  "src/commands/auth-bootstrap-ceo.ts"() {
    "use strict";
    init_src2();
    init_env();
    init_store();
  }
});

// src/utils/banner.ts
import pc2 from "picocolors";
function printPaperclipCliBanner() {
  const lines = [
    "",
    ...GROWTHUB_ART,
    pc2.dim("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"),
    pc2.bold(`  ${TAGLINE}`),
    ""
  ];
  console.log(lines.join("\n"));
}
var GROWTHUB_ART, TAGLINE;
var init_banner = __esm({
  "src/utils/banner.ts"() {
    "use strict";
    GROWTHUB_ART = [
      " \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557    \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 ",
      "\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551    \u2588\u2588\u2551\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557",
      "\u2588\u2588\u2551  \u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551 \u2588\u2557 \u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D",
      "\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557",
      "\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u255A\u2588\u2588\u2588\u2554\u2588\u2588\u2588\u2554\u255D   \u2588\u2588\u2551   \u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D",
      " \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D  \u255A\u2550\u2550\u255D\u255A\u2550\u2550\u255D    \u255A\u2550\u255D   \u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D "
    ];
    TAGLINE = "Growth infrastructure over a stable agentic substrate";
  }
});

// src/checks/agent-jwt-secret-check.ts
function agentJwtSecretCheck(configPath) {
  if (readAgentJwtSecretFromEnv(configPath)) {
    return {
      name: "Agent JWT secret",
      status: "pass",
      message: "PAPERCLIP_AGENT_JWT_SECRET is set in environment"
    };
  }
  const envPath = resolveAgentJwtEnvFile(configPath);
  const fileSecret = readAgentJwtSecretFromEnvFile(envPath);
  if (fileSecret) {
    return {
      name: "Agent JWT secret",
      status: "warn",
      message: `PAPERCLIP_AGENT_JWT_SECRET is present in ${envPath} but not loaded into environment`,
      repairHint: `Set the value from ${envPath} in your shell before starting the Growthub server`
    };
  }
  return {
    name: "Agent JWT secret",
    status: "fail",
    message: `PAPERCLIP_AGENT_JWT_SECRET missing from environment and ${envPath}`,
    canRepair: true,
    repair: () => {
      ensureAgentJwtSecret(configPath);
    },
    repairHint: `Run with --repair to create ${envPath} containing PAPERCLIP_AGENT_JWT_SECRET`
  };
}
var init_agent_jwt_secret_check = __esm({
  "src/checks/agent-jwt-secret-check.ts"() {
    "use strict";
    init_env();
  }
});

// src/checks/config-check.ts
function configCheck(configPath) {
  const filePath = resolveConfigPath(configPath);
  if (!configExists(configPath)) {
    return {
      name: "Config file",
      status: "fail",
      message: `Config file not found at ${filePath}`,
      canRepair: false,
      repairHint: "Run `paperclipai onboard` to create one"
    };
  }
  try {
    readConfig(configPath);
    return {
      name: "Config file",
      status: "pass",
      message: `Valid config at ${filePath}`
    };
  } catch (err) {
    return {
      name: "Config file",
      status: "fail",
      message: `Invalid config: ${err instanceof Error ? err.message : String(err)}`,
      canRepair: false,
      repairHint: "Run `paperclipai configure --section database` (or `paperclipai onboard` to recreate)"
    };
  }
}
var init_config_check = __esm({
  "src/checks/config-check.ts"() {
    "use strict";
    init_store();
  }
});

// src/checks/deployment-auth-check.ts
function isLoopbackHost(host) {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}
function deploymentAuthCheck(config) {
  const mode = config.server.deploymentMode;
  const exposure = config.server.exposure;
  const auth = config.auth;
  if (mode === "local_trusted") {
    if (!isLoopbackHost(config.server.host)) {
      return {
        name: "Deployment/auth mode",
        status: "fail",
        message: `local_trusted requires loopback host binding (found ${config.server.host})`,
        canRepair: false,
        repairHint: "Run `paperclipai configure --section server` and set host to 127.0.0.1"
      };
    }
    return {
      name: "Deployment/auth mode",
      status: "pass",
      message: "local_trusted mode is configured for loopback-only access"
    };
  }
  const secret = process.env.BETTER_AUTH_SECRET?.trim() ?? process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim();
  if (!secret) {
    return {
      name: "Deployment/auth mode",
      status: "fail",
      message: "authenticated mode requires BETTER_AUTH_SECRET (or PAPERCLIP_AGENT_JWT_SECRET)",
      canRepair: false,
      repairHint: "Set BETTER_AUTH_SECRET before starting Paperclip"
    };
  }
  if (auth.baseUrlMode === "explicit" && !auth.publicBaseUrl) {
    return {
      name: "Deployment/auth mode",
      status: "fail",
      message: "auth.baseUrlMode=explicit requires auth.publicBaseUrl",
      canRepair: false,
      repairHint: "Run `paperclipai configure --section server` and provide a base URL"
    };
  }
  if (exposure === "public") {
    if (auth.baseUrlMode !== "explicit" || !auth.publicBaseUrl) {
      return {
        name: "Deployment/auth mode",
        status: "fail",
        message: "authenticated/public requires explicit auth.publicBaseUrl",
        canRepair: false,
        repairHint: "Run `paperclipai configure --section server` and select public exposure"
      };
    }
    try {
      const url = new URL(auth.publicBaseUrl);
      if (url.protocol !== "https:") {
        return {
          name: "Deployment/auth mode",
          status: "warn",
          message: "Public exposure should use an https:// auth.publicBaseUrl",
          canRepair: false,
          repairHint: "Use HTTPS in production for secure session cookies"
        };
      }
    } catch {
      return {
        name: "Deployment/auth mode",
        status: "fail",
        message: "auth.publicBaseUrl is not a valid URL",
        canRepair: false,
        repairHint: "Run `paperclipai configure --section server` and provide a valid URL"
      };
    }
  }
  return {
    name: "Deployment/auth mode",
    status: "pass",
    message: `Mode ${mode}/${exposure} with auth URL mode ${auth.baseUrlMode}`
  };
}
var init_deployment_auth_check = __esm({
  "src/checks/deployment-auth-check.ts"() {
    "use strict";
  }
});

// src/checks/path-resolver.ts
var init_path_resolver2 = __esm({
  "src/checks/path-resolver.ts"() {
    "use strict";
    init_path_resolver();
  }
});

// src/checks/database-check.ts
import fs5 from "node:fs";
async function databaseCheck(config, configPath) {
  if (config.database.mode === "postgres") {
    if (!config.database.connectionString) {
      return {
        name: "Database",
        status: "fail",
        message: "PostgreSQL mode selected but no connection string configured",
        canRepair: false,
        repairHint: "Run `paperclipai configure --section database`"
      };
    }
    try {
      const { createDb: createDb2 } = await Promise.resolve().then(() => (init_src2(), src_exports));
      const db = createDb2(config.database.connectionString);
      await db.execute("SELECT 1");
      return {
        name: "Database",
        status: "pass",
        message: "PostgreSQL connection successful"
      };
    } catch (err) {
      return {
        name: "Database",
        status: "fail",
        message: `Cannot connect to PostgreSQL: ${err instanceof Error ? err.message : String(err)}`,
        canRepair: false,
        repairHint: "Check your connection string and ensure PostgreSQL is running"
      };
    }
  }
  if (config.database.mode === "embedded-postgres") {
    const dataDir = resolveRuntimeLikePath(config.database.embeddedPostgresDataDir, configPath);
    const reportedPath = dataDir;
    if (!fs5.existsSync(dataDir)) {
      fs5.mkdirSync(reportedPath, { recursive: true });
    }
    return {
      name: "Database",
      status: "pass",
      message: `Embedded PostgreSQL configured at ${dataDir} (port ${config.database.embeddedPostgresPort})`
    };
  }
  return {
    name: "Database",
    status: "fail",
    message: `Unknown database mode: ${String(config.database.mode)}`,
    canRepair: false,
    repairHint: "Run `paperclipai configure --section database`"
  };
}
var init_database_check = __esm({
  "src/checks/database-check.ts"() {
    "use strict";
    init_path_resolver2();
  }
});

// src/checks/llm-check.ts
async function llmCheck(config) {
  if (!config.llm) {
    return {
      name: "LLM provider",
      status: "pass",
      message: "No LLM provider configured (optional)"
    };
  }
  if (!config.llm.apiKey) {
    return {
      name: "LLM provider",
      status: "pass",
      message: `${config.llm.provider} configured but no API key set (optional)`
    };
  }
  try {
    if (config.llm.provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": config.llm.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }]
        })
      });
      if (res.ok || res.status === 400) {
        return { name: "LLM provider", status: "pass", message: "Claude API key is valid" };
      }
      if (res.status === 401) {
        return {
          name: "LLM provider",
          status: "fail",
          message: "Claude API key is invalid (401)",
          canRepair: false,
          repairHint: "Run `paperclipai configure --section llm`"
        };
      }
      return {
        name: "LLM provider",
        status: "warn",
        message: `Claude API returned status ${res.status}`
      };
    } else {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${config.llm.apiKey}` }
      });
      if (res.ok) {
        return { name: "LLM provider", status: "pass", message: "OpenAI API key is valid" };
      }
      if (res.status === 401) {
        return {
          name: "LLM provider",
          status: "fail",
          message: "OpenAI API key is invalid (401)",
          canRepair: false,
          repairHint: "Run `paperclipai configure --section llm`"
        };
      }
      return {
        name: "LLM provider",
        status: "warn",
        message: `OpenAI API returned status ${res.status}`
      };
    }
  } catch {
    return {
      name: "LLM provider",
      status: "warn",
      message: "Could not reach API to validate key"
    };
  }
}
var init_llm_check = __esm({
  "src/checks/llm-check.ts"() {
    "use strict";
  }
});

// src/checks/log-check.ts
import fs6 from "node:fs";
function logCheck(config, configPath) {
  const logDir = resolveRuntimeLikePath(config.logging.logDir, configPath);
  const reportedDir = logDir;
  if (!fs6.existsSync(logDir)) {
    fs6.mkdirSync(reportedDir, { recursive: true });
  }
  try {
    fs6.accessSync(reportedDir, fs6.constants.W_OK);
    return {
      name: "Log directory",
      status: "pass",
      message: `Log directory is writable: ${reportedDir}`
    };
  } catch {
    return {
      name: "Log directory",
      status: "fail",
      message: `Log directory is not writable: ${logDir}`,
      canRepair: false,
      repairHint: "Check file permissions on the log directory"
    };
  }
}
var init_log_check = __esm({
  "src/checks/log-check.ts"() {
    "use strict";
    init_path_resolver2();
  }
});

// src/utils/net.ts
import net from "node:net";
function checkPort(port) {
  return new Promise((resolve2) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve2({ available: false, error: `Port ${port} is already in use` });
      } else {
        resolve2({ available: false, error: err.message });
      }
    });
    server.once("listening", () => {
      server.close(() => resolve2({ available: true }));
    });
    server.listen(port, "127.0.0.1");
  });
}
var init_net = __esm({
  "src/utils/net.ts"() {
    "use strict";
  }
});

// src/checks/port-check.ts
async function portCheck(config) {
  const port = config.server.port;
  const result = await checkPort(port);
  if (result.available) {
    return {
      name: "Server port",
      status: "pass",
      message: `Port ${port} is available`
    };
  }
  return {
    name: "Server port",
    status: "warn",
    message: result.error ?? `Port ${port} is not available`,
    canRepair: false,
    repairHint: `Check what's using port ${port} with: lsof -i :${port}`
  };
}
var init_port_check = __esm({
  "src/checks/port-check.ts"() {
    "use strict";
    init_net();
  }
});

// src/checks/secrets-check.ts
import { randomBytes as randomBytes4 } from "node:crypto";
import fs7 from "node:fs";
import path6 from "node:path";
function decodeMasterKey(raw) {
  const trimmed = raw.trim();
  if (!trimmed)
    return null;
  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32)
      return decoded;
  } catch {
  }
  if (Buffer.byteLength(trimmed, "utf8") === 32) {
    return Buffer.from(trimmed, "utf8");
  }
  return null;
}
function withStrictModeNote(base, config) {
  const strictModeDisabledInDeployedSetup = config.database.mode === "postgres" && config.secrets.strictMode === false;
  if (!strictModeDisabledInDeployedSetup)
    return base;
  if (base.status === "fail")
    return base;
  return {
    ...base,
    status: "warn",
    message: `${base.message}; strict secret mode is disabled for postgres deployment`,
    repairHint: base.repairHint ? `${base.repairHint}. Consider enabling secrets.strictMode` : "Consider enabling secrets.strictMode"
  };
}
function secretsCheck(config, configPath) {
  const provider = config.secrets.provider;
  if (provider !== "local_encrypted") {
    return {
      name: "Secrets adapter",
      status: "fail",
      message: `${provider} is configured, but this build only supports local_encrypted`,
      canRepair: false,
      repairHint: "Run `paperclipai configure --section secrets` and set provider to local_encrypted"
    };
  }
  const envMasterKey = process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  if (envMasterKey && envMasterKey.trim().length > 0) {
    if (!decodeMasterKey(envMasterKey)) {
      return {
        name: "Secrets adapter",
        status: "fail",
        message: "PAPERCLIP_SECRETS_MASTER_KEY is invalid (expected 32-byte base64, 64-char hex, or raw 32-char string)",
        canRepair: false,
        repairHint: "Set PAPERCLIP_SECRETS_MASTER_KEY to a valid key or unset it to use a key file"
      };
    }
    return withStrictModeNote(
      {
        name: "Secrets adapter",
        status: "pass",
        message: "Local encrypted provider configured via PAPERCLIP_SECRETS_MASTER_KEY"
      },
      config
    );
  }
  const keyFileOverride = process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
  const configuredPath = keyFileOverride && keyFileOverride.trim().length > 0 ? keyFileOverride.trim() : config.secrets.localEncrypted.keyFilePath;
  const keyFilePath = resolveRuntimeLikePath(configuredPath, configPath);
  if (!fs7.existsSync(keyFilePath)) {
    return withStrictModeNote(
      {
        name: "Secrets adapter",
        status: "warn",
        message: `Secrets key file does not exist yet: ${keyFilePath}`,
        canRepair: true,
        repair: () => {
          fs7.mkdirSync(path6.dirname(keyFilePath), { recursive: true });
          fs7.writeFileSync(keyFilePath, randomBytes4(32).toString("base64"), {
            encoding: "utf8",
            mode: 384
          });
          try {
            fs7.chmodSync(keyFilePath, 384);
          } catch {
          }
        },
        repairHint: "Run with --repair to create a local encrypted secrets key file"
      },
      config
    );
  }
  let raw;
  try {
    raw = fs7.readFileSync(keyFilePath, "utf8");
  } catch (err) {
    return {
      name: "Secrets adapter",
      status: "fail",
      message: `Could not read secrets key file: ${err instanceof Error ? err.message : String(err)}`,
      canRepair: false,
      repairHint: "Check file permissions or set PAPERCLIP_SECRETS_MASTER_KEY"
    };
  }
  if (!decodeMasterKey(raw)) {
    return {
      name: "Secrets adapter",
      status: "fail",
      message: `Invalid key material in ${keyFilePath}`,
      canRepair: false,
      repairHint: "Replace with valid key material or delete it and run doctor --repair"
    };
  }
  return withStrictModeNote(
    {
      name: "Secrets adapter",
      status: "pass",
      message: `Local encrypted provider configured with key file ${keyFilePath}`
    },
    config
  );
}
var init_secrets_check = __esm({
  "src/checks/secrets-check.ts"() {
    "use strict";
    init_path_resolver2();
  }
});

// src/checks/storage-check.ts
import fs8 from "node:fs";
function storageCheck(config, configPath) {
  if (config.storage.provider === "local_disk") {
    const baseDir = resolveRuntimeLikePath(config.storage.localDisk.baseDir, configPath);
    if (!fs8.existsSync(baseDir)) {
      fs8.mkdirSync(baseDir, { recursive: true });
    }
    try {
      fs8.accessSync(baseDir, fs8.constants.W_OK);
      return {
        name: "Storage",
        status: "pass",
        message: `Local disk storage is writable: ${baseDir}`
      };
    } catch {
      return {
        name: "Storage",
        status: "fail",
        message: `Local storage directory is not writable: ${baseDir}`,
        canRepair: false,
        repairHint: "Check file permissions for storage.localDisk.baseDir"
      };
    }
  }
  const bucket = config.storage.s3.bucket.trim();
  const region = config.storage.s3.region.trim();
  if (!bucket || !region) {
    return {
      name: "Storage",
      status: "fail",
      message: "S3 storage requires non-empty bucket and region",
      canRepair: false,
      repairHint: "Run `paperclipai configure --section storage`"
    };
  }
  return {
    name: "Storage",
    status: "warn",
    message: `S3 storage configured (bucket=${bucket}, region=${region}). Reachability check is skipped in doctor.`,
    canRepair: false,
    repairHint: "Verify credentials and endpoint in deployment environment"
  };
}
var init_storage_check = __esm({
  "src/checks/storage-check.ts"() {
    "use strict";
    init_path_resolver2();
  }
});

// src/checks/index.ts
var init_checks = __esm({
  "src/checks/index.ts"() {
    "use strict";
    init_agent_jwt_secret_check();
    init_config_check();
    init_deployment_auth_check();
    init_database_check();
    init_llm_check();
    init_log_check();
    init_port_check();
    init_secrets_check();
    init_storage_check();
  }
});

// src/commands/doctor.ts
import * as p8 from "@clack/prompts";
import pc3 from "picocolors";
async function doctor(opts) {
  printPaperclipCliBanner();
  p8.intro(pc3.bgCyan(pc3.black(" growthub doctor ")));
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);
  const results = [];
  const cfgResult = configCheck(opts.config);
  results.push(cfgResult);
  printResult(cfgResult);
  if (cfgResult.status === "fail") {
    return printSummary(results);
  }
  let config;
  try {
    config = readConfig(opts.config);
  } catch (err) {
    const readResult = {
      name: "Config file",
      status: "fail",
      message: `Could not read config: ${err instanceof Error ? err.message : String(err)}`,
      canRepair: false,
      repairHint: "Run `growthub configure --section database` or `growthub onboard`"
    };
    results.push(readResult);
    printResult(readResult);
    return printSummary(results);
  }
  const deploymentAuthResult = deploymentAuthCheck(config);
  results.push(deploymentAuthResult);
  printResult(deploymentAuthResult);
  results.push(
    await runRepairableCheck({
      run: () => agentJwtSecretCheck(opts.config),
      configPath,
      opts
    })
  );
  results.push(
    await runRepairableCheck({
      run: () => secretsCheck(config, configPath),
      configPath,
      opts
    })
  );
  results.push(
    await runRepairableCheck({
      run: () => storageCheck(config, configPath),
      configPath,
      opts
    })
  );
  results.push(
    await runRepairableCheck({
      run: () => databaseCheck(config, configPath),
      configPath,
      opts
    })
  );
  const llmResult = await llmCheck(config);
  results.push(llmResult);
  printResult(llmResult);
  results.push(
    await runRepairableCheck({
      run: () => logCheck(config, configPath),
      configPath,
      opts
    })
  );
  const portResult = await portCheck(config);
  results.push(portResult);
  printResult(portResult);
  return printSummary(results);
}
function printResult(result) {
  const icon = STATUS_ICON[result.status];
  p8.log.message(`${icon} ${pc3.bold(result.name)}: ${result.message}`);
  if (result.status !== "pass" && result.repairHint) {
    p8.log.message(`  ${pc3.dim(result.repairHint)}`);
  }
}
async function maybeRepair(result, opts) {
  if (result.status === "pass" || !result.canRepair || !result.repair)
    return false;
  if (!opts.repair)
    return false;
  let shouldRepair = opts.yes;
  if (!shouldRepair) {
    const answer = await p8.confirm({
      message: `Repair "${result.name}"?`,
      initialValue: true
    });
    if (p8.isCancel(answer))
      return false;
    shouldRepair = answer;
  }
  if (shouldRepair) {
    try {
      await result.repair();
      p8.log.success(`Repaired: ${result.name}`);
      return true;
    } catch (err) {
      p8.log.error(`Repair failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return false;
}
async function runRepairableCheck(input) {
  let result = await input.run();
  printResult(result);
  const repaired = await maybeRepair(result, input.opts);
  if (!repaired)
    return result;
  loadPaperclipEnvFile(input.configPath);
  result = await input.run();
  printResult(result);
  return result;
}
function printSummary(results) {
  const passed = results.filter((r) => r.status === "pass").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const parts = [];
  parts.push(pc3.green(`${passed} passed`));
  if (warned)
    parts.push(pc3.yellow(`${warned} warnings`));
  if (failed)
    parts.push(pc3.red(`${failed} failed`));
  p8.note(parts.join(", "), "Summary");
  if (failed > 0) {
    p8.outro(pc3.red("Some checks failed. Fix the issues above and re-run doctor."));
  } else if (warned > 0) {
    p8.outro(pc3.yellow("All critical checks passed with some warnings."));
  } else {
    p8.outro(pc3.green("All checks passed!"));
  }
  return { passed, warned, failed };
}
var STATUS_ICON;
var init_doctor = __esm({
  "src/commands/doctor.ts"() {
    "use strict";
    init_store();
    init_checks();
    init_env();
    init_banner();
    STATUS_ICON = {
      pass: pc3.green("\u2713"),
      warn: pc3.yellow("!"),
      fail: pc3.red("\u2717")
    };
  }
});

// src/commands/run.ts
var run_exports = {};
__export(run_exports, {
  runCommand: () => runCommand
});
import fs9 from "node:fs";
import path7 from "node:path";
import { fileURLToPath as fileURLToPath2, pathToFileURL } from "node:url";
import * as p9 from "@clack/prompts";
import pc4 from "picocolors";
async function runCommand(opts) {
  const instanceId = resolvePaperclipInstanceId(opts.instance);
  process.env.PAPERCLIP_INSTANCE_ID = instanceId;
  const homeDir = resolvePaperclipHomeDir();
  fs9.mkdirSync(homeDir, { recursive: true });
  const paths = describeLocalInstancePaths(instanceId);
  fs9.mkdirSync(paths.instanceRoot, { recursive: true });
  const configPath = resolveConfigPath(opts.config);
  process.env.PAPERCLIP_CONFIG = configPath;
  loadPaperclipEnvFile(configPath);
  p9.intro(pc4.bgCyan(pc4.black(" growthub run ")));
  p9.log.message(pc4.dim(`Home: ${paths.homeDir}`));
  p9.log.message(pc4.dim(`Instance: ${paths.instanceId}`));
  p9.log.message(pc4.dim(`Config: ${configPath}`));
  if (!configExists(configPath)) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      p9.log.error("No config found and terminal is non-interactive.");
      p9.log.message(`Run ${pc4.cyan("growthub onboard")} once, then retry ${pc4.cyan("growthub run")}.`);
      process.exit(1);
    }
    p9.log.step("No config found. Starting onboarding...");
    await onboard({ config: configPath, invokedByRun: true });
  }
  p9.log.step("Running doctor checks...");
  const summary = await doctor({
    config: configPath,
    repair: opts.repair ?? true,
    yes: opts.yes ?? true
  });
  if (summary.failed > 0) {
    p9.log.error("Doctor found blocking issues. Not starting server.");
    process.exit(1);
  }
  const config = readConfig(configPath);
  if (!config) {
    p9.log.error(`No config found at ${configPath}.`);
    process.exit(1);
  }
  p9.log.step("Starting Growthub server...");
  const startedServer = await importServerEntry();
  if (shouldGenerateBootstrapInviteAfterStart(config)) {
    p9.log.step("Generating bootstrap CEO invite");
    await bootstrapCeoInvite({
      config: configPath,
      dbUrl: startedServer.databaseUrl,
      baseUrl: resolveBootstrapInviteBaseUrl(config, startedServer)
    });
  }
}
function resolveBootstrapInviteBaseUrl(config, startedServer) {
  const explicitBaseUrl = process.env.PAPERCLIP_PUBLIC_URL ?? process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL ?? process.env.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_BASE_URL ?? (config.auth.baseUrlMode === "explicit" ? config.auth.publicBaseUrl : void 0);
  if (typeof explicitBaseUrl === "string" && explicitBaseUrl.trim().length > 0) {
    return explicitBaseUrl.trim().replace(/\/+$/, "");
  }
  return startedServer.apiUrl.replace(/\/api$/, "");
}
function formatError(err) {
  if (err instanceof Error) {
    if (err.message && err.message.trim().length > 0)
      return err.message;
    return err.name;
  }
  if (typeof err === "string")
    return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
function isModuleNotFoundError(err) {
  if (!(err instanceof Error))
    return false;
  const code = err.code;
  if (code === "ERR_MODULE_NOT_FOUND")
    return true;
  return err.message.includes("Cannot find module");
}
function getMissingModuleSpecifier(err) {
  if (!(err instanceof Error))
    return null;
  const packageMatch = err.message.match(/Cannot find package '([^']+)' imported from/);
  if (packageMatch?.[1])
    return packageMatch[1];
  const moduleMatch = err.message.match(/Cannot find module '([^']+)'/);
  if (moduleMatch?.[1])
    return moduleMatch[1];
  return null;
}
function maybeEnableUiDevMiddleware(entrypoint) {
  if (process.env.PAPERCLIP_UI_DEV_MIDDLEWARE !== void 0)
    return;
  const normalized = entrypoint.replaceAll("\\", "/");
  if (normalized.endsWith("/server/src/index.ts") || normalized.endsWith("@paperclipai/server/src/index.ts")) {
    process.env.PAPERCLIP_UI_DEV_MIDDLEWARE = "true";
  }
}
async function importServerEntry() {
  const projectRoot = path7.resolve(path7.dirname(fileURLToPath2(import.meta.url)), "../../..");
  const devEntry = path7.resolve(projectRoot, "server/src/index.ts");
  if (fs9.existsSync(devEntry)) {
    maybeEnableUiDevMiddleware(devEntry);
    const mod = await import(pathToFileURL(devEntry).href);
    return await startServerFromModule(mod, devEntry);
  }
  const bundledEntry = path7.resolve(
    path7.dirname(fileURLToPath2(import.meta.url)),
    "./runtime/server/dist/index.js"
  );
  if (fs9.existsSync(bundledEntry)) {
    const mod = await import(pathToFileURL(bundledEntry).href);
    return await startServerFromModule(mod, bundledEntry);
  }
  try {
    const mod = await import("@paperclipai/server");
    return await startServerFromModule(mod, "@paperclipai/server");
  } catch (err) {
    const missingSpecifier = getMissingModuleSpecifier(err);
    const missingServerEntrypoint = !missingSpecifier || missingSpecifier === "@paperclipai/server";
    if (isModuleNotFoundError(err) && missingServerEntrypoint) {
      throw new Error(
        `Could not locate a Growthub server entrypoint.
Tried: ${devEntry}, ${bundledEntry}, @paperclipai/server
${formatError(err)}`
      );
    }
    throw new Error(
      `Growthub server failed to start.
${formatError(err)}`
    );
  }
}
function shouldGenerateBootstrapInviteAfterStart(config) {
  return config.server.deploymentMode === "authenticated" && config.database.mode === "embedded-postgres";
}
async function startServerFromModule(mod, label) {
  const startServer = mod.startServer;
  if (typeof startServer !== "function") {
    throw new Error(`Growthub server entrypoint did not export startServer(): ${label}`);
  }
  return await startServer();
}
var init_run = __esm({
  "src/commands/run.ts"() {
    "use strict";
    init_auth_bootstrap_ceo();
    init_onboard();
    init_doctor();
    init_env();
    init_store();
    init_store();
    init_home();
  }
});

// src/commands/onboard.ts
import * as p10 from "@clack/prompts";
import path8 from "node:path";
import pc5 from "picocolors";
function parseBooleanFromEnv(rawValue) {
  if (rawValue === void 0)
    return null;
  const lower = rawValue.trim().toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes")
    return true;
  if (lower === "false" || lower === "0" || lower === "no")
    return false;
  return null;
}
function parseNumberFromEnv(rawValue) {
  if (!rawValue)
    return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed))
    return null;
  return parsed;
}
function parseEnumFromEnv(rawValue, allowedValues) {
  if (!rawValue)
    return null;
  return allowedValues.includes(rawValue) ? rawValue : null;
}
function resolvePathFromEnv(rawValue) {
  if (!rawValue || rawValue.trim().length === 0)
    return null;
  return path8.resolve(expandHomePrefix(rawValue.trim()));
}
function quickstartDefaultsFromEnv() {
  const instanceId = resolvePaperclipInstanceId();
  const defaultStorage = defaultStorageConfig();
  const defaultSecrets = defaultSecretsConfig();
  const databaseUrl = process.env.DATABASE_URL?.trim() || void 0;
  const publicUrl = process.env.PAPERCLIP_PUBLIC_URL?.trim() || process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim() || process.env.BETTER_AUTH_BASE_URL?.trim() || void 0;
  const deploymentMode = parseEnumFromEnv(process.env.PAPERCLIP_DEPLOYMENT_MODE, DEPLOYMENT_MODES) ?? "local_trusted";
  const surfaceProfile = parseEnumFromEnv(process.env.PAPERCLIP_SURFACE_PROFILE, SURFACE_PROFILES) ?? "dx";
  const deploymentExposureFromEnv = parseEnumFromEnv(
    process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE,
    DEPLOYMENT_EXPOSURES
  );
  const deploymentExposure = deploymentMode === "local_trusted" ? "private" : deploymentExposureFromEnv ?? "private";
  const authPublicBaseUrl = publicUrl;
  const authBaseUrlModeFromEnv = parseEnumFromEnv(
    process.env.PAPERCLIP_AUTH_BASE_URL_MODE,
    AUTH_BASE_URL_MODES
  );
  const authBaseUrlMode = authBaseUrlModeFromEnv ?? (authPublicBaseUrl ? "explicit" : "auto");
  const allowedHostnamesFromEnv = process.env.PAPERCLIP_ALLOWED_HOSTNAMES ? process.env.PAPERCLIP_ALLOWED_HOSTNAMES.split(",").map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0) : [];
  const hostnameFromPublicUrl = publicUrl ? (() => {
    try {
      return new URL(publicUrl).hostname.trim().toLowerCase();
    } catch {
      return null;
    }
  })() : null;
  const storageProvider = parseEnumFromEnv(process.env.PAPERCLIP_STORAGE_PROVIDER, STORAGE_PROVIDERS) ?? defaultStorage.provider;
  const secretsProvider = parseEnumFromEnv(process.env.PAPERCLIP_SECRETS_PROVIDER, SECRET_PROVIDERS) ?? defaultSecrets.provider;
  const databaseBackupEnabled = parseBooleanFromEnv(process.env.PAPERCLIP_DB_BACKUP_ENABLED) ?? true;
  const databaseBackupIntervalMinutes = Math.max(
    1,
    parseNumberFromEnv(process.env.PAPERCLIP_DB_BACKUP_INTERVAL_MINUTES) ?? 60
  );
  const databaseBackupRetentionDays = Math.max(
    1,
    parseNumberFromEnv(process.env.PAPERCLIP_DB_BACKUP_RETENTION_DAYS) ?? 30
  );
  const defaults = {
    database: {
      mode: databaseUrl ? "postgres" : "embedded-postgres",
      ...databaseUrl ? { connectionString: databaseUrl } : {},
      embeddedPostgresDataDir: resolveDefaultEmbeddedPostgresDir(instanceId),
      embeddedPostgresPort: 54329,
      backup: {
        enabled: databaseBackupEnabled,
        intervalMinutes: databaseBackupIntervalMinutes,
        retentionDays: databaseBackupRetentionDays,
        dir: resolvePathFromEnv(process.env.PAPERCLIP_DB_BACKUP_DIR) ?? resolveDefaultBackupDir(instanceId)
      }
    },
    logging: {
      mode: "file",
      logDir: resolveDefaultLogsDir(instanceId)
    },
    server: {
      deploymentMode,
      exposure: deploymentExposure,
      host: process.env.HOST ?? "127.0.0.1",
      port: Number(process.env.PORT) || 3100,
      allowedHostnames: Array.from(/* @__PURE__ */ new Set([...allowedHostnamesFromEnv, ...hostnameFromPublicUrl ? [hostnameFromPublicUrl] : []])),
      serveUi: parseBooleanFromEnv(process.env.SERVE_UI) ?? true
    },
    auth: {
      baseUrlMode: authBaseUrlMode,
      disableSignUp: false,
      ...authPublicBaseUrl ? { publicBaseUrl: authPublicBaseUrl } : {}
    },
    surface: {
      profile: surfaceProfile
    },
    storage: {
      provider: storageProvider,
      localDisk: {
        baseDir: resolvePathFromEnv(process.env.PAPERCLIP_STORAGE_LOCAL_DIR) ?? defaultStorage.localDisk.baseDir
      },
      s3: {
        bucket: process.env.PAPERCLIP_STORAGE_S3_BUCKET ?? defaultStorage.s3.bucket,
        region: process.env.PAPERCLIP_STORAGE_S3_REGION ?? defaultStorage.s3.region,
        endpoint: process.env.PAPERCLIP_STORAGE_S3_ENDPOINT ?? defaultStorage.s3.endpoint,
        prefix: process.env.PAPERCLIP_STORAGE_S3_PREFIX ?? defaultStorage.s3.prefix,
        forcePathStyle: parseBooleanFromEnv(process.env.PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE) ?? defaultStorage.s3.forcePathStyle
      }
    },
    secrets: {
      provider: secretsProvider,
      strictMode: parseBooleanFromEnv(process.env.PAPERCLIP_SECRETS_STRICT_MODE) ?? defaultSecrets.strictMode,
      localEncrypted: {
        keyFilePath: resolvePathFromEnv(process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE) ?? defaultSecrets.localEncrypted.keyFilePath
      }
    }
  };
  const ignoredEnvKeys = [];
  if (deploymentMode === "local_trusted" && process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE !== void 0) {
    ignoredEnvKeys.push({
      key: "PAPERCLIP_DEPLOYMENT_EXPOSURE",
      reason: "Ignored because deployment mode local_trusted always forces private exposure"
    });
  }
  const ignoredKeySet = new Set(ignoredEnvKeys.map((entry) => entry.key));
  const usedEnvKeys = ONBOARD_ENV_KEYS.filter(
    (key) => process.env[key] !== void 0 && !ignoredKeySet.has(key)
  );
  return { defaults, usedEnvKeys, ignoredEnvKeys };
}
function canCreateBootstrapInviteImmediately(config) {
  return config.server.deploymentMode === "authenticated" && config.database.mode !== "embedded-postgres";
}
async function onboard(opts) {
  printPaperclipCliBanner();
  p10.intro(pc5.bgCyan(pc5.black(" growthub onboard ")));
  const configPath = resolveConfigPath(opts.config);
  const instance = describeLocalInstancePaths(resolvePaperclipInstanceId());
  p10.log.message(
    pc5.dim(
      `Local home: ${instance.homeDir} | instance: ${instance.instanceId} | config: ${configPath}`
    )
  );
  if (configExists(opts.config)) {
    p10.log.message(pc5.dim(`${configPath} exists, updating config`));
    try {
      readConfig(opts.config);
    } catch (err) {
      p10.log.message(
        pc5.yellow(
          `Existing config appears invalid and will be updated.
${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }
  let setupMode = "quickstart";
  if (opts.yes) {
    p10.log.message(pc5.dim("`--yes` enabled: using Quickstart defaults."));
  } else {
    const setupModeChoice = await p10.select({
      message: "Choose setup path",
      options: [
        {
          value: "quickstart",
          label: "Quickstart",
          hint: "Recommended: local defaults + ready to run"
        },
        {
          value: "advanced",
          label: "Advanced setup",
          hint: "Customize database, server, storage, and more"
        }
      ],
      initialValue: "quickstart"
    });
    if (p10.isCancel(setupModeChoice)) {
      p10.cancel("Setup cancelled.");
      return;
    }
    setupMode = setupModeChoice;
  }
  let llm;
  const { defaults: derivedDefaults, usedEnvKeys, ignoredEnvKeys } = quickstartDefaultsFromEnv();
  let {
    database,
    logging,
    server,
    auth,
    surface,
    storage,
    secrets
  } = derivedDefaults;
  if (setupMode === "advanced") {
    p10.log.step(pc5.bold("Database"));
    database = await promptDatabase(database);
    if (database.mode === "postgres" && database.connectionString) {
      const s = p10.spinner();
      s.start("Testing database connection...");
      try {
        const { createDb: createDb2 } = await Promise.resolve().then(() => (init_src2(), src_exports));
        const db = createDb2(database.connectionString);
        await db.execute("SELECT 1");
        s.stop("Database connection successful");
      } catch {
        s.stop(pc5.yellow("Could not connect to database \u2014 you can fix this later with `growthub doctor`"));
      }
    }
    p10.log.step(pc5.bold("LLM Provider"));
    llm = await promptLlm();
    if (llm?.apiKey) {
      const s = p10.spinner();
      s.start("Validating API key...");
      try {
        if (llm.provider === "claude") {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": llm.apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json"
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-5-20250929",
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }]
            })
          });
          if (res.ok || res.status === 400) {
            s.stop("API key is valid");
          } else if (res.status === 401) {
            s.stop(pc5.yellow("API key appears invalid \u2014 you can update it later"));
          } else {
            s.stop(pc5.yellow("Could not validate API key \u2014 continuing anyway"));
          }
        } else {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${llm.apiKey}` }
          });
          if (res.ok) {
            s.stop("API key is valid");
          } else if (res.status === 401) {
            s.stop(pc5.yellow("API key appears invalid \u2014 you can update it later"));
          } else {
            s.stop(pc5.yellow("Could not validate API key \u2014 continuing anyway"));
          }
        }
      } catch {
        s.stop(pc5.yellow("Could not reach API \u2014 continuing anyway"));
      }
    }
    p10.log.step(pc5.bold("Logging"));
    logging = await promptLogging();
    p10.log.step(pc5.bold("Server"));
    ({ server, auth } = await promptServer({ currentServer: server, currentAuth: auth }));
    const surfaceChoice = await p10.select({
      message: "Choose Growthub profile",
      options: [
        {
          value: "dx",
          label: "DX",
          hint: "Local-first builder and developer tooling"
        },
        {
          value: "gtm",
          label: "GTM",
          hint: "Focused GTM product surface"
        }
      ],
      initialValue: surface.profile
    });
    if (p10.isCancel(surfaceChoice)) {
      p10.cancel("Setup cancelled.");
      return;
    }
    surface = { profile: surfaceChoice };
    p10.log.step(pc5.bold("Storage"));
    storage = await promptStorage(storage);
    p10.log.step(pc5.bold("Secrets"));
    const secretsDefaults = defaultSecretsConfig();
    secrets = {
      provider: secrets.provider ?? secretsDefaults.provider,
      strictMode: secrets.strictMode ?? secretsDefaults.strictMode,
      localEncrypted: {
        keyFilePath: secrets.localEncrypted?.keyFilePath ?? secretsDefaults.localEncrypted.keyFilePath
      }
    };
    p10.log.message(
      pc5.dim(
        `Using defaults: provider=${secrets.provider}, strictMode=${secrets.strictMode}, keyFile=${secrets.localEncrypted.keyFilePath}`
      )
    );
  } else {
    p10.log.step(pc5.bold("Quickstart"));
    p10.log.message(pc5.dim("Using quickstart defaults."));
    if (usedEnvKeys.length > 0) {
      p10.log.message(pc5.dim(`Environment-aware defaults active (${usedEnvKeys.length} env var(s) detected).`));
    } else {
      p10.log.message(
        pc5.dim("No environment overrides detected: embedded database, file storage, local encrypted secrets.")
      );
    }
    for (const ignored of ignoredEnvKeys) {
      p10.log.message(pc5.dim(`Ignored ${ignored.key}: ${ignored.reason}`));
    }
  }
  const jwtSecret = ensureAgentJwtSecret(configPath);
  const envFilePath = resolveAgentJwtEnvFile(configPath);
  if (jwtSecret.created) {
    p10.log.success(`Created ${pc5.cyan("PAPERCLIP_AGENT_JWT_SECRET")} in ${pc5.dim(envFilePath)}`);
  } else if (process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim()) {
    p10.log.info(`Using existing ${pc5.cyan("PAPERCLIP_AGENT_JWT_SECRET")} from environment`);
  } else {
    p10.log.info(`Using existing ${pc5.cyan("PAPERCLIP_AGENT_JWT_SECRET")} in ${pc5.dim(envFilePath)}`);
  }
  const config = {
    $meta: {
      version: 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "onboard"
    },
    ...llm && { llm },
    database,
    logging,
    server,
    auth,
    surface,
    storage,
    secrets
  };
  const keyResult = ensureLocalSecretsKeyFile(config, configPath);
  if (keyResult.status === "created") {
    p10.log.success(`Created local secrets key file at ${pc5.dim(keyResult.path)}`);
  } else if (keyResult.status === "existing") {
    p10.log.message(pc5.dim(`Using existing local secrets key file at ${keyResult.path}`));
  }
  writeConfig(config, opts.config);
  p10.note(
    [
      `Database: ${database.mode}`,
      llm ? `LLM: ${llm.provider}` : "LLM: not configured",
      `Logging: ${logging.mode} -> ${logging.logDir}`,
      `Server: ${server.deploymentMode}/${server.exposure} @ ${server.host}:${server.port}`,
      `Allowed hosts: ${server.allowedHostnames.length > 0 ? server.allowedHostnames.join(", ") : "(loopback only)"}`,
      `Auth URL mode: ${auth.baseUrlMode}${auth.publicBaseUrl ? ` (${auth.publicBaseUrl})` : ""}`,
      `Surface: ${surface.profile}`,
      `Storage: ${storage.provider}`,
      `Secrets: ${secrets.provider} (strict mode ${secrets.strictMode ? "on" : "off"})`,
      "Agent auth: PAPERCLIP_AGENT_JWT_SECRET configured"
    ].join("\n"),
    "Configuration saved"
  );
  p10.note(
    [
      `Run: ${pc5.cyan("growthub run")}`,
      `Reconfigure later: ${pc5.cyan("growthub configure")}`,
      `Diagnose setup: ${pc5.cyan("growthub doctor")}`
    ].join("\n"),
    "Next commands"
  );
  if (canCreateBootstrapInviteImmediately({ database, server })) {
    p10.log.step("Generating bootstrap CEO invite");
    await bootstrapCeoInvite({ config: configPath });
  }
  let shouldRunNow = opts.run === true || opts.yes === true;
  if (!shouldRunNow && !opts.invokedByRun && process.stdin.isTTY && process.stdout.isTTY) {
    const answer = await p10.confirm({
      message: "Start Growthub now?",
      initialValue: true
    });
    if (!p10.isCancel(answer)) {
      shouldRunNow = answer;
    }
  }
  if (shouldRunNow && !opts.invokedByRun) {
    process.env.PAPERCLIP_OPEN_ON_LISTEN = "true";
    const { runCommand: runCommand2 } = await Promise.resolve().then(() => (init_run(), run_exports));
    await runCommand2({ config: configPath, repair: true, yes: true });
    return;
  }
  if (server.deploymentMode === "authenticated" && database.mode === "embedded-postgres") {
    p10.log.info(
      [
        "Bootstrap CEO invite will be created after the server starts.",
        `Next: ${pc5.cyan("growthub run")}`,
        `Then: ${pc5.cyan("growthub auth bootstrap-ceo")}`
      ].join("\n")
    );
  }
  p10.outro("You're all set!");
}
var ONBOARD_ENV_KEYS;
var init_onboard = __esm({
  "src/commands/onboard.ts"() {
    "use strict";
    init_src();
    init_store();
    init_env();
    init_secrets_key();
    init_database();
    init_llm();
    init_logging();
    init_secrets();
    init_storage();
    init_server();
    init_home();
    init_auth_bootstrap_ceo();
    init_banner();
    ONBOARD_ENV_KEYS = [
      "PAPERCLIP_PUBLIC_URL",
      "DATABASE_URL",
      "PAPERCLIP_DB_BACKUP_ENABLED",
      "PAPERCLIP_DB_BACKUP_INTERVAL_MINUTES",
      "PAPERCLIP_DB_BACKUP_RETENTION_DAYS",
      "PAPERCLIP_DB_BACKUP_DIR",
      "PAPERCLIP_DEPLOYMENT_MODE",
      "PAPERCLIP_DEPLOYMENT_EXPOSURE",
      "HOST",
      "PORT",
      "SERVE_UI",
      "PAPERCLIP_ALLOWED_HOSTNAMES",
      "PAPERCLIP_AUTH_BASE_URL_MODE",
      "PAPERCLIP_AUTH_PUBLIC_BASE_URL",
      "BETTER_AUTH_URL",
      "BETTER_AUTH_BASE_URL",
      "PAPERCLIP_SURFACE_PROFILE",
      "PAPERCLIP_STORAGE_PROVIDER",
      "PAPERCLIP_STORAGE_LOCAL_DIR",
      "PAPERCLIP_STORAGE_S3_BUCKET",
      "PAPERCLIP_STORAGE_S3_REGION",
      "PAPERCLIP_STORAGE_S3_ENDPOINT",
      "PAPERCLIP_STORAGE_S3_PREFIX",
      "PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE",
      "PAPERCLIP_SECRETS_PROVIDER",
      "PAPERCLIP_SECRETS_STRICT_MODE",
      "PAPERCLIP_SECRETS_MASTER_KEY_FILE"
    ];
  }
});

// src/index.ts
init_onboard();
init_doctor();
import { Command } from "commander";
import * as p24 from "@clack/prompts";
import pc36 from "picocolors";
import fs27 from "node:fs";
import path35 from "node:path";
import { spawnSync as spawnSync2 } from "node:child_process";

// src/commands/env.ts
init_store();
init_env();
init_home();
import * as p11 from "@clack/prompts";
import pc6 from "picocolors";
var DEFAULT_AGENT_JWT_TTL_SECONDS = "172800";
var DEFAULT_AGENT_JWT_ISSUER = "paperclip";
var DEFAULT_AGENT_JWT_AUDIENCE = "paperclip-api";
var DEFAULT_HEARTBEAT_SCHEDULER_INTERVAL_MS = "30000";
var DEFAULT_SECRETS_PROVIDER = "local_encrypted";
var DEFAULT_STORAGE_PROVIDER = "local_disk";
function defaultSecretsKeyFilePath() {
  return resolveDefaultSecretsKeyFilePath(resolvePaperclipInstanceId());
}
function defaultStorageBaseDir2() {
  return resolveDefaultStorageDir(resolvePaperclipInstanceId());
}
async function envCommand(opts) {
  p11.intro(pc6.bgCyan(pc6.black(" paperclip env ")));
  const configPath = resolveConfigPath(opts.config);
  let config = null;
  let configReadError = null;
  if (configExists(opts.config)) {
    p11.log.message(pc6.dim(`Config file: ${configPath}`));
    try {
      config = readConfig(opts.config);
    } catch (err) {
      configReadError = err instanceof Error ? err.message : String(err);
      p11.log.message(pc6.yellow(`Could not parse config: ${configReadError}`));
    }
  } else {
    p11.log.message(pc6.dim(`Config file missing: ${configPath}`));
  }
  const rows = collectDeploymentEnvRows(config, configPath);
  const missingRequired = rows.filter((row) => row.required && row.source === "missing");
  const sortedRows = rows.sort((a, b) => Number(b.required) - Number(a.required) || a.key.localeCompare(b.key));
  const requiredRows = sortedRows.filter((row) => row.required);
  const optionalRows = sortedRows.filter((row) => !row.required);
  const formatSection = (title, entries) => {
    if (entries.length === 0)
      return;
    p11.log.message(pc6.bold(title));
    for (const entry of entries) {
      const status = entry.source === "missing" ? pc6.red("missing") : entry.source === "default" ? pc6.yellow("default") : pc6.green("set");
      const sourceNote = {
        env: "environment",
        config: "config",
        file: "file",
        default: "default",
        missing: "missing"
      }[entry.source];
      p11.log.message(
        `${pc6.cyan(entry.key)} ${status.padEnd(7)} ${pc6.dim(`[${sourceNote}] ${entry.note}`)}${entry.source === "missing" ? "" : ` ${pc6.dim("=>")} ${pc6.white(quoteShellValue(entry.value))}`}`
      );
    }
  };
  formatSection("Required environment variables", requiredRows);
  formatSection("Optional environment variables", optionalRows);
  const exportRows = rows.map((row) => row.source === "missing" ? { ...row, value: "<set-this-value>" } : row);
  const uniqueRows = uniqueByKey(exportRows);
  const exportBlock = uniqueRows.map((row) => `export ${row.key}=${quoteShellValue(row.value)}`).join("\n");
  if (configReadError) {
    p11.log.error(`Could not load config cleanly: ${configReadError}`);
  }
  p11.note(
    exportBlock || "No values detected. Set required variables manually.",
    "Deployment export block"
  );
  if (missingRequired.length > 0) {
    p11.log.message(
      pc6.yellow(
        `Missing required values: ${missingRequired.map((row) => row.key).join(", ")}. Set these before deployment.`
      )
    );
  } else {
    p11.log.message(pc6.green("All required deployment variables are present."));
  }
  p11.outro("Done");
}
function collectDeploymentEnvRows(config, configPath) {
  const agentJwtEnvFile = resolveAgentJwtEnvFile(configPath);
  const jwtEnv = readAgentJwtSecretFromEnv(configPath);
  const jwtFile = jwtEnv ? null : readAgentJwtSecretFromEnvFile(agentJwtEnvFile);
  const jwtSource = jwtEnv ? "env" : jwtFile ? "file" : "missing";
  const dbUrl = process.env.DATABASE_URL ?? config?.database?.connectionString ?? "";
  const databaseMode = config?.database?.mode ?? "embedded-postgres";
  const dbUrlSource = process.env.DATABASE_URL ? "env" : config?.database?.connectionString ? "config" : "missing";
  const publicUrl = process.env.PAPERCLIP_PUBLIC_URL ?? process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL ?? process.env.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_BASE_URL ?? config?.auth?.publicBaseUrl ?? "";
  const publicUrlSource = process.env.PAPERCLIP_PUBLIC_URL ? "env" : process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL || process.env.BETTER_AUTH_URL || process.env.BETTER_AUTH_BASE_URL ? "env" : config?.auth?.publicBaseUrl ? "config" : "missing";
  let trustedOriginsDefault = "";
  if (publicUrl) {
    try {
      trustedOriginsDefault = new URL(publicUrl).origin;
    } catch {
      trustedOriginsDefault = "";
    }
  }
  const heartbeatInterval = process.env.HEARTBEAT_SCHEDULER_INTERVAL_MS ?? DEFAULT_HEARTBEAT_SCHEDULER_INTERVAL_MS;
  const heartbeatEnabled = process.env.HEARTBEAT_SCHEDULER_ENABLED ?? "true";
  const secretsProvider = process.env.PAPERCLIP_SECRETS_PROVIDER ?? config?.secrets?.provider ?? DEFAULT_SECRETS_PROVIDER;
  const secretsStrictMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE ?? String(config?.secrets?.strictMode ?? false);
  const secretsKeyFilePath = process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE ?? config?.secrets?.localEncrypted?.keyFilePath ?? defaultSecretsKeyFilePath();
  const storageProvider = process.env.PAPERCLIP_STORAGE_PROVIDER ?? config?.storage?.provider ?? DEFAULT_STORAGE_PROVIDER;
  const storageLocalDir = process.env.PAPERCLIP_STORAGE_LOCAL_DIR ?? config?.storage?.localDisk?.baseDir ?? defaultStorageBaseDir2();
  const storageS3Bucket = process.env.PAPERCLIP_STORAGE_S3_BUCKET ?? config?.storage?.s3?.bucket ?? "paperclip";
  const storageS3Region = process.env.PAPERCLIP_STORAGE_S3_REGION ?? config?.storage?.s3?.region ?? "us-east-1";
  const storageS3Endpoint = process.env.PAPERCLIP_STORAGE_S3_ENDPOINT ?? config?.storage?.s3?.endpoint ?? "";
  const storageS3Prefix = process.env.PAPERCLIP_STORAGE_S3_PREFIX ?? config?.storage?.s3?.prefix ?? "";
  const storageS3ForcePathStyle = process.env.PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE ?? String(config?.storage?.s3?.forcePathStyle ?? false);
  const rows = [
    {
      key: "PAPERCLIP_AGENT_JWT_SECRET",
      value: jwtEnv ?? jwtFile ?? "",
      source: jwtSource,
      required: true,
      note: jwtSource === "missing" ? "Generate during onboard or set manually (required for local adapter authentication)" : jwtSource === "env" ? "Set in process environment" : `Set in ${agentJwtEnvFile}`
    },
    {
      key: "DATABASE_URL",
      value: dbUrl,
      source: dbUrlSource,
      required: true,
      note: databaseMode === "postgres" ? "Configured for postgres mode (required)" : "Required for live deployment with managed PostgreSQL"
    },
    {
      key: "PORT",
      value: process.env.PORT ?? (config?.server?.port !== void 0 ? String(config.server.port) : "3100"),
      source: process.env.PORT ? "env" : config?.server?.port !== void 0 ? "config" : "default",
      required: false,
      note: "HTTP listen port"
    },
    {
      key: "PAPERCLIP_PUBLIC_URL",
      value: publicUrl,
      source: publicUrlSource,
      required: false,
      note: "Canonical public URL for auth/callback/invite origin wiring"
    },
    {
      key: "BETTER_AUTH_TRUSTED_ORIGINS",
      value: process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? trustedOriginsDefault,
      source: process.env.BETTER_AUTH_TRUSTED_ORIGINS ? "env" : trustedOriginsDefault ? "default" : "missing",
      required: false,
      note: "Comma-separated auth origin allowlist (auto-derived from PAPERCLIP_PUBLIC_URL when possible)"
    },
    {
      key: "PAPERCLIP_AGENT_JWT_TTL_SECONDS",
      value: process.env.PAPERCLIP_AGENT_JWT_TTL_SECONDS ?? DEFAULT_AGENT_JWT_TTL_SECONDS,
      source: process.env.PAPERCLIP_AGENT_JWT_TTL_SECONDS ? "env" : "default",
      required: false,
      note: "JWT lifetime in seconds"
    },
    {
      key: "PAPERCLIP_AGENT_JWT_ISSUER",
      value: process.env.PAPERCLIP_AGENT_JWT_ISSUER ?? DEFAULT_AGENT_JWT_ISSUER,
      source: process.env.PAPERCLIP_AGENT_JWT_ISSUER ? "env" : "default",
      required: false,
      note: "JWT issuer"
    },
    {
      key: "PAPERCLIP_AGENT_JWT_AUDIENCE",
      value: process.env.PAPERCLIP_AGENT_JWT_AUDIENCE ?? DEFAULT_AGENT_JWT_AUDIENCE,
      source: process.env.PAPERCLIP_AGENT_JWT_AUDIENCE ? "env" : "default",
      required: false,
      note: "JWT audience"
    },
    {
      key: "HEARTBEAT_SCHEDULER_INTERVAL_MS",
      value: heartbeatInterval,
      source: process.env.HEARTBEAT_SCHEDULER_INTERVAL_MS ? "env" : "default",
      required: false,
      note: "Heartbeat worker interval in ms"
    },
    {
      key: "HEARTBEAT_SCHEDULER_ENABLED",
      value: heartbeatEnabled,
      source: process.env.HEARTBEAT_SCHEDULER_ENABLED ? "env" : "default",
      required: false,
      note: "Set to `false` to disable timer scheduling"
    },
    {
      key: "PAPERCLIP_SECRETS_PROVIDER",
      value: secretsProvider,
      source: process.env.PAPERCLIP_SECRETS_PROVIDER ? "env" : config?.secrets?.provider ? "config" : "default",
      required: false,
      note: "Default provider for new secrets"
    },
    {
      key: "PAPERCLIP_SECRETS_STRICT_MODE",
      value: secretsStrictMode,
      source: process.env.PAPERCLIP_SECRETS_STRICT_MODE ? "env" : config?.secrets?.strictMode !== void 0 ? "config" : "default",
      required: false,
      note: "Require secret refs for sensitive env keys"
    },
    {
      key: "PAPERCLIP_SECRETS_MASTER_KEY_FILE",
      value: secretsKeyFilePath,
      source: process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE ? "env" : config?.secrets?.localEncrypted?.keyFilePath ? "config" : "default",
      required: false,
      note: "Path to local encrypted secrets key file"
    },
    {
      key: "PAPERCLIP_STORAGE_PROVIDER",
      value: storageProvider,
      source: process.env.PAPERCLIP_STORAGE_PROVIDER ? "env" : config?.storage?.provider ? "config" : "default",
      required: false,
      note: "Storage provider (local_disk or s3)"
    },
    {
      key: "PAPERCLIP_STORAGE_LOCAL_DIR",
      value: storageLocalDir,
      source: process.env.PAPERCLIP_STORAGE_LOCAL_DIR ? "env" : config?.storage?.localDisk?.baseDir ? "config" : "default",
      required: false,
      note: "Local storage base directory for local_disk provider"
    },
    {
      key: "PAPERCLIP_STORAGE_S3_BUCKET",
      value: storageS3Bucket,
      source: process.env.PAPERCLIP_STORAGE_S3_BUCKET ? "env" : config?.storage?.s3?.bucket ? "config" : "default",
      required: false,
      note: "S3 bucket name for s3 provider"
    },
    {
      key: "PAPERCLIP_STORAGE_S3_REGION",
      value: storageS3Region,
      source: process.env.PAPERCLIP_STORAGE_S3_REGION ? "env" : config?.storage?.s3?.region ? "config" : "default",
      required: false,
      note: "S3 region for s3 provider"
    },
    {
      key: "PAPERCLIP_STORAGE_S3_ENDPOINT",
      value: storageS3Endpoint,
      source: process.env.PAPERCLIP_STORAGE_S3_ENDPOINT ? "env" : config?.storage?.s3?.endpoint ? "config" : "default",
      required: false,
      note: "Optional custom endpoint for S3-compatible providers"
    },
    {
      key: "PAPERCLIP_STORAGE_S3_PREFIX",
      value: storageS3Prefix,
      source: process.env.PAPERCLIP_STORAGE_S3_PREFIX ? "env" : config?.storage?.s3?.prefix ? "config" : "default",
      required: false,
      note: "Optional object key prefix"
    },
    {
      key: "PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE",
      value: storageS3ForcePathStyle,
      source: process.env.PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE ? "env" : config?.storage?.s3?.forcePathStyle !== void 0 ? "config" : "default",
      required: false,
      note: "Set true for path-style access on compatible providers"
    }
  ];
  const defaultConfigPath = resolveConfigPath();
  if (process.env.PAPERCLIP_CONFIG || configPath !== defaultConfigPath) {
    rows.push({
      key: "PAPERCLIP_CONFIG",
      value: process.env.PAPERCLIP_CONFIG ?? configPath,
      source: process.env.PAPERCLIP_CONFIG ? "env" : "default",
      required: false,
      note: "Optional path override for config file"
    });
  }
  return rows;
}
function uniqueByKey(rows) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const row of rows) {
    if (seen.has(row.key))
      continue;
    seen.add(row.key);
    result.push(row);
  }
  return result;
}
function quoteShellValue(value) {
  if (value === "")
    return '""';
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// src/commands/configure.ts
init_store();
init_secrets_key();
init_database();
init_llm();
init_logging();
init_secrets();
init_storage();
init_server();
init_home();
init_banner();
import * as p12 from "@clack/prompts";
import pc7 from "picocolors";
var SECTION_LABELS = {
  llm: "LLM Provider",
  database: "Database",
  logging: "Logging",
  server: "Server",
  storage: "Storage",
  secrets: "Secrets"
};
function defaultConfig() {
  const instanceId = resolvePaperclipInstanceId();
  const config = {
    $meta: {
      version: 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "configure"
    },
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: resolveDefaultEmbeddedPostgresDir(instanceId),
      embeddedPostgresPort: 54329,
      backup: {
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 30,
        dir: resolveDefaultBackupDir(instanceId)
      }
    },
    logging: {
      mode: "file",
      logDir: resolveDefaultLogsDir(instanceId)
    },
    server: {
      deploymentMode: "local_trusted",
      exposure: "private",
      host: "127.0.0.1",
      port: 3100,
      allowedHostnames: [],
      serveUi: true
    },
    auth: {
      baseUrlMode: "auto",
      disableSignUp: false
    },
    surface: {
      profile: "dx"
    },
    storage: defaultStorageConfig(),
    secrets: defaultSecretsConfig()
  };
  return config;
}
async function configure(opts) {
  printPaperclipCliBanner();
  p12.intro(pc7.bgCyan(pc7.black(" paperclip configure ")));
  const configPath = resolveConfigPath(opts.config);
  if (!configExists(opts.config)) {
    p12.log.error("No config file found. Run `paperclipai onboard` first.");
    p12.outro("");
    return;
  }
  let config;
  try {
    config = readConfig(opts.config) ?? defaultConfig();
  } catch (err) {
    p12.log.message(
      pc7.yellow(
        `Existing config is invalid. Loading defaults so you can repair it now.
${err instanceof Error ? err.message : String(err)}`
      )
    );
    config = defaultConfig();
  }
  let section = opts.section;
  if (section && !SECTION_LABELS[section]) {
    p12.log.error(`Unknown section: ${section}. Choose from: ${Object.keys(SECTION_LABELS).join(", ")}`);
    p12.outro("");
    return;
  }
  let sectionsToConfigure;
  if (section) {
    sectionsToConfigure = [section];
  } else {
    const choices = await p12.multiselect({
      message: "Which sections do you want to configure?",
      options: Object.entries(SECTION_LABELS).map(([value, label]) => ({
        value,
        label
      }))
    });
    if (p12.isCancel(choices)) {
      p12.cancel("Configuration cancelled.");
      return;
    }
    sectionsToConfigure = choices;
    if (sectionsToConfigure.length === 0) {
      p12.cancel("No sections selected.");
      return;
    }
  }
  for (const selectedSection of sectionsToConfigure) {
    p12.log.step(pc7.bold(SECTION_LABELS[selectedSection]));
    switch (selectedSection) {
      case "database":
        config.database = await promptDatabase(config.database);
        break;
      case "llm": {
        const llm = await promptLlm();
        if (llm) {
          config.llm = llm;
        } else {
          delete config.llm;
        }
        break;
      }
      case "logging":
        config.logging = await promptLogging();
        break;
      case "server":
        {
          const { server, auth } = await promptServer({
            currentServer: config.server,
            currentAuth: config.auth
          });
          config.server = server;
          config.auth = auth;
        }
        break;
      case "storage":
        config.storage = await promptStorage(config.storage);
        break;
      case "secrets":
        config.secrets = await promptSecrets(config.secrets);
        {
          const keyResult = ensureLocalSecretsKeyFile(config, configPath);
          if (keyResult.status === "created") {
            p12.log.success(`Created local secrets key file at ${pc7.dim(keyResult.path)}`);
          } else if (keyResult.status === "existing") {
            p12.log.message(pc7.dim(`Using existing local secrets key file at ${keyResult.path}`));
          } else if (keyResult.status === "skipped_provider") {
            p12.log.message(pc7.dim("Skipping local key file management for non-local provider"));
          } else {
            p12.log.message(pc7.dim("Skipping local key file management because PAPERCLIP_SECRETS_MASTER_KEY is set"));
          }
        }
        break;
    }
    config.$meta.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    config.$meta.source = "configure";
    writeConfig(config, opts.config);
    p12.log.success(`${SECTION_LABELS[selectedSection]} configuration updated.`);
  }
  p12.outro("Configuration saved.");
}

// src/commands/allowed-hostname.ts
init_hostnames();
init_store();
import * as p13 from "@clack/prompts";
import pc8 from "picocolors";
async function addAllowedHostname(host, opts) {
  const configPath = resolveConfigPath(opts.config);
  const config = readConfig(opts.config);
  if (!config) {
    p13.log.error(`No config found at ${configPath}. Run ${pc8.cyan("paperclip onboard")} first.`);
    return;
  }
  const normalized = normalizeHostnameInput(host);
  const current = new Set((config.server.allowedHostnames ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  const existed = current.has(normalized);
  current.add(normalized);
  config.server.allowedHostnames = Array.from(current).sort();
  config.$meta.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  config.$meta.source = "configure";
  writeConfig(config, opts.config);
  if (existed) {
    p13.log.info(`Hostname ${pc8.cyan(normalized)} is already allowed.`);
  } else {
    p13.log.success(`Added allowed hostname: ${pc8.cyan(normalized)}`);
    p13.log.message(
      pc8.dim("Restart the Paperclip server for this change to take effect.")
    );
  }
  if (!(config.server.deploymentMode === "authenticated" && config.server.exposure === "private")) {
    p13.log.message(
      pc8.dim("Note: allowed hostnames are enforced only in authenticated/private mode.")
    );
  }
}

// src/commands/heartbeat-run.ts
import { setTimeout as delay } from "node:timers/promises";
import pc18 from "picocolors";

// ../packages/adapters/claude-local/src/cli/format-event.ts
import pc9 from "picocolors";
function asErrorText(value) {
  if (typeof value === "string")
    return value;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return "";
  const obj = value;
  const message = typeof obj.message === "string" && obj.message || typeof obj.error === "string" && obj.error || typeof obj.code === "string" && obj.code || "";
  if (message)
    return message;
  try {
    return JSON.stringify(obj);
  } catch {
    return "";
  }
}
function printClaudeStreamEvent(raw, debug) {
  const line = raw.trim();
  if (!line)
    return;
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    console.log(line);
    return;
  }
  const type = typeof parsed.type === "string" ? parsed.type : "";
  if (type === "system" && parsed.subtype === "init") {
    const model = typeof parsed.model === "string" ? parsed.model : "unknown";
    const sessionId = typeof parsed.session_id === "string" ? parsed.session_id : "";
    console.log(pc9.blue(`Claude initialized (model: ${model}${sessionId ? `, session: ${sessionId}` : ""})`));
    return;
  }
  if (type === "assistant") {
    const message = typeof parsed.message === "object" && parsed.message !== null && !Array.isArray(parsed.message) ? parsed.message : {};
    const content = Array.isArray(message.content) ? message.content : [];
    for (const blockRaw of content) {
      if (typeof blockRaw !== "object" || blockRaw === null || Array.isArray(blockRaw))
        continue;
      const block = blockRaw;
      const blockType = typeof block.type === "string" ? block.type : "";
      if (blockType === "text") {
        const text63 = typeof block.text === "string" ? block.text : "";
        if (text63)
          console.log(pc9.green(`assistant: ${text63}`));
      } else if (blockType === "tool_use") {
        const name = typeof block.name === "string" ? block.name : "unknown";
        console.log(pc9.yellow(`tool_call: ${name}`));
        if (block.input !== void 0) {
          console.log(pc9.gray(JSON.stringify(block.input, null, 2)));
        }
      }
    }
    return;
  }
  if (type === "result") {
    const usage = typeof parsed.usage === "object" && parsed.usage !== null && !Array.isArray(parsed.usage) ? parsed.usage : {};
    const input = Number(usage.input_tokens ?? 0);
    const output = Number(usage.output_tokens ?? 0);
    const cached = Number(usage.cache_read_input_tokens ?? 0);
    const cost = Number(parsed.total_cost_usd ?? 0);
    const subtype = typeof parsed.subtype === "string" ? parsed.subtype : "";
    const isError = parsed.is_error === true;
    const resultText = typeof parsed.result === "string" ? parsed.result : "";
    if (resultText) {
      console.log(pc9.green("result:"));
      console.log(resultText);
    }
    const errors = Array.isArray(parsed.errors) ? parsed.errors.map(asErrorText).filter(Boolean) : [];
    if (subtype.startsWith("error") || isError || errors.length > 0) {
      console.log(pc9.red(`claude_result: subtype=${subtype || "unknown"} is_error=${isError ? "true" : "false"}`));
      if (errors.length > 0) {
        console.log(pc9.red(`claude_errors: ${errors.join(" | ")}`));
      }
    }
    console.log(
      pc9.blue(
        `tokens: in=${Number.isFinite(input) ? input : 0} out=${Number.isFinite(output) ? output : 0} cached=${Number.isFinite(cached) ? cached : 0} cost=$${Number.isFinite(cost) ? cost.toFixed(6) : "0.000000"}`
      )
    );
    return;
  }
  if (debug) {
    console.log(pc9.gray(line));
  }
}

// ../packages/adapters/codex-local/src/cli/format-event.ts
import pc10 from "picocolors";
function asRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value;
}
function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function errorText(value) {
  if (typeof value === "string")
    return value;
  const rec = asRecord(value);
  if (!rec)
    return "";
  const msg = typeof rec.message === "string" && rec.message || typeof rec.error === "string" && rec.error || typeof rec.code === "string" && rec.code || "";
  if (msg)
    return msg;
  try {
    return JSON.stringify(rec);
  } catch {
    return "";
  }
}
function printItemStarted(item) {
  const itemType = asString(item.type);
  if (itemType === "command_execution") {
    const command = asString(item.command);
    console.log(pc10.yellow("tool_call: command_execution"));
    if (command)
      console.log(pc10.gray(command));
    return true;
  }
  if (itemType === "tool_use") {
    const name = asString(item.name, "unknown");
    console.log(pc10.yellow(`tool_call: ${name}`));
    if (item.input !== void 0) {
      try {
        console.log(pc10.gray(JSON.stringify(item.input, null, 2)));
      } catch {
        console.log(pc10.gray(String(item.input)));
      }
    }
    return true;
  }
  return false;
}
function printItemCompleted(item) {
  const itemType = asString(item.type);
  if (itemType === "agent_message") {
    const text63 = asString(item.text);
    if (text63)
      console.log(pc10.green(`assistant: ${text63}`));
    return true;
  }
  if (itemType === "reasoning") {
    const text63 = asString(item.text);
    if (text63)
      console.log(pc10.gray(`thinking: ${text63}`));
    return true;
  }
  if (itemType === "tool_use") {
    const name = asString(item.name, "unknown");
    console.log(pc10.yellow(`tool_call: ${name}`));
    if (item.input !== void 0) {
      try {
        console.log(pc10.gray(JSON.stringify(item.input, null, 2)));
      } catch {
        console.log(pc10.gray(String(item.input)));
      }
    }
    return true;
  }
  if (itemType === "command_execution") {
    const command = asString(item.command);
    const status = asString(item.status);
    const exitCode = typeof item.exit_code === "number" && Number.isFinite(item.exit_code) ? item.exit_code : null;
    const output = asString(item.aggregated_output).replace(/\s+$/, "");
    const isError = exitCode !== null && exitCode !== 0 || status === "failed" || status === "errored" || status === "error" || status === "cancelled";
    const summaryParts = [
      "tool_result: command_execution",
      command ? `command="${command}"` : "",
      status ? `status=${status}` : "",
      exitCode !== null ? `exit_code=${exitCode}` : ""
    ].filter(Boolean);
    console.log((isError ? pc10.red : pc10.cyan)(summaryParts.join(" ")));
    if (output)
      console.log((isError ? pc10.red : pc10.gray)(output));
    return true;
  }
  if (itemType === "file_change") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const entries = changes.map((changeRaw) => asRecord(changeRaw)).filter((change) => Boolean(change)).map((change) => {
      const kind = asString(change.kind, "update");
      const path36 = asString(change.path, "unknown");
      return `${kind} ${path36}`;
    });
    const preview = entries.length > 0 ? entries.slice(0, 6).join(", ") : "none";
    const more = entries.length > 6 ? ` (+${entries.length - 6} more)` : "";
    console.log(pc10.cyan(`file_change: ${preview}${more}`));
    return true;
  }
  if (itemType === "error") {
    const message = errorText(item.message ?? item.error ?? item);
    if (message)
      console.log(pc10.red(`error: ${message}`));
    return true;
  }
  if (itemType === "tool_result") {
    const isError = item.is_error === true || asString(item.status) === "error";
    const text63 = asString(item.content) || asString(item.result) || asString(item.output);
    console.log((isError ? pc10.red : pc10.cyan)(`tool_result${isError ? " (error)" : ""}`));
    if (text63)
      console.log((isError ? pc10.red : pc10.gray)(text63));
    return true;
  }
  return false;
}
function printCodexStreamEvent(raw, _debug) {
  const line = raw.trim();
  if (!line)
    return;
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    console.log(line);
    return;
  }
  const type = asString(parsed.type);
  if (type === "thread.started") {
    const threadId = asString(parsed.thread_id);
    const model = asString(parsed.model);
    const details = [threadId ? `session: ${threadId}` : "", model ? `model: ${model}` : ""].filter(Boolean).join(", ");
    console.log(pc10.blue(`Codex thread started${details ? ` (${details})` : ""}`));
    return;
  }
  if (type === "turn.started") {
    console.log(pc10.blue("turn started"));
    return;
  }
  if (type === "item.started" || type === "item.completed") {
    const item = asRecord(parsed.item);
    if (item) {
      const handled = type === "item.started" ? printItemStarted(item) : printItemCompleted(item);
      if (!handled) {
        const itemType = asString(item.type, "unknown");
        const id = asString(item.id);
        const status = asString(item.status);
        const meta = [id ? `id=${id}` : "", status ? `status=${status}` : ""].filter(Boolean).join(" ");
        console.log(pc10.gray(`${type}: ${itemType}${meta ? ` (${meta})` : ""}`));
      }
    } else {
      console.log(pc10.gray(type));
    }
    return;
  }
  if (type === "turn.completed") {
    const usage = asRecord(parsed.usage);
    const input = asNumber(usage?.input_tokens);
    const output = asNumber(usage?.output_tokens);
    const cached = asNumber(usage?.cached_input_tokens, asNumber(usage?.cache_read_input_tokens));
    const cost = asNumber(parsed.total_cost_usd);
    const isError = parsed.is_error === true;
    const subtype = asString(parsed.subtype);
    const errors = Array.isArray(parsed.errors) ? parsed.errors.map(errorText).filter(Boolean) : [];
    console.log(
      pc10.blue(`tokens: in=${input} out=${output} cached=${cached} cost=$${cost.toFixed(6)}`)
    );
    if (subtype || isError || errors.length > 0) {
      console.log(
        pc10.red(`result: subtype=${subtype || "unknown"} is_error=${isError ? "true" : "false"}`)
      );
      if (errors.length > 0)
        console.log(pc10.red(`errors: ${errors.join(" | ")}`));
    }
    return;
  }
  if (type === "turn.failed") {
    const usage = asRecord(parsed.usage);
    const input = asNumber(usage?.input_tokens);
    const output = asNumber(usage?.output_tokens);
    const cached = asNumber(usage?.cached_input_tokens, asNumber(usage?.cache_read_input_tokens));
    const message = errorText(parsed.error ?? parsed.message);
    console.log(pc10.red(`turn failed${message ? `: ${message}` : ""}`));
    console.log(pc10.blue(`tokens: in=${input} out=${output} cached=${cached}`));
    return;
  }
  if (type === "error") {
    const message = errorText(parsed.message ?? parsed.error ?? parsed);
    if (message)
      console.log(pc10.red(`error: ${message}`));
    return;
  }
  console.log(line);
}

// ../packages/adapters/cursor-local/src/cli/format-event.ts
import pc11 from "picocolors";

// ../packages/adapters/cursor-local/src/shared/stream.ts
function normalizeCursorStreamLine(rawLine) {
  const trimmed = rawLine.trim();
  if (!trimmed)
    return { stream: null, line: "" };
  const prefixed = trimmed.match(/^(stdout|stderr)\s*[:=]?\s*([\[{].*)$/i);
  if (!prefixed) {
    return { stream: null, line: trimmed };
  }
  const stream = prefixed[1]?.toLowerCase() === "stderr" ? "stderr" : "stdout";
  const line = (prefixed[2] ?? "").trim();
  return { stream, line };
}

// ../packages/adapters/cursor-local/src/cli/format-event.ts
function asRecord2(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value;
}
function asString2(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asNumber2(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function stringifyUnknown(value) {
  if (typeof value === "string")
    return value;
  if (value === null || value === void 0)
    return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function printUserMessage(messageRaw) {
  if (typeof messageRaw === "string") {
    const text63 = messageRaw.trim();
    if (text63)
      console.log(pc11.gray(`user: ${text63}`));
    return;
  }
  const message = asRecord2(messageRaw);
  if (!message)
    return;
  const directText = asString2(message.text).trim();
  if (directText)
    console.log(pc11.gray(`user: ${directText}`));
  const content = Array.isArray(message.content) ? message.content : [];
  for (const partRaw of content) {
    const part = asRecord2(partRaw);
    if (!part)
      continue;
    const type = asString2(part.type).trim();
    if (type !== "output_text" && type !== "text")
      continue;
    const text63 = asString2(part.text).trim();
    if (text63)
      console.log(pc11.gray(`user: ${text63}`));
  }
}
function printAssistantMessage(messageRaw) {
  if (typeof messageRaw === "string") {
    const text63 = messageRaw.trim();
    if (text63)
      console.log(pc11.green(`assistant: ${text63}`));
    return;
  }
  const message = asRecord2(messageRaw);
  if (!message)
    return;
  const directText = asString2(message.text).trim();
  if (directText)
    console.log(pc11.green(`assistant: ${directText}`));
  const content = Array.isArray(message.content) ? message.content : [];
  for (const partRaw of content) {
    const part = asRecord2(partRaw);
    if (!part)
      continue;
    const type = asString2(part.type).trim();
    if (type === "output_text" || type === "text") {
      const text63 = asString2(part.text).trim();
      if (text63)
        console.log(pc11.green(`assistant: ${text63}`));
      continue;
    }
    if (type === "thinking") {
      const text63 = asString2(part.text).trim();
      if (text63)
        console.log(pc11.gray(`thinking: ${text63}`));
      continue;
    }
    if (type === "tool_call") {
      const name = asString2(part.name, asString2(part.tool, "tool"));
      console.log(pc11.yellow(`tool_call: ${name}`));
      const input = part.input ?? part.arguments ?? part.args;
      if (input !== void 0) {
        try {
          console.log(pc11.gray(JSON.stringify(input, null, 2)));
        } catch {
          console.log(pc11.gray(String(input)));
        }
      }
      continue;
    }
    if (type === "tool_result") {
      const isError = part.is_error === true || asString2(part.status).toLowerCase() === "error";
      const contentText = asString2(part.output) || asString2(part.text) || asString2(part.result) || stringifyUnknown(part.output ?? part.result ?? part.text ?? part);
      console.log((isError ? pc11.red : pc11.cyan)(`tool_result${isError ? " (error)" : ""}`));
      if (contentText)
        console.log((isError ? pc11.red : pc11.gray)(contentText));
    }
  }
}
function printToolCallEventTopLevel(parsed) {
  const subtype = asString2(parsed.subtype).trim().toLowerCase();
  const callId = asString2(parsed.call_id, asString2(parsed.callId, asString2(parsed.id, "")));
  const toolCall = asRecord2(parsed.tool_call ?? parsed.toolCall);
  if (!toolCall) {
    console.log(pc11.yellow(`tool_call${subtype ? `: ${subtype}` : ""}`));
    return;
  }
  const [toolName] = Object.keys(toolCall);
  if (!toolName) {
    console.log(pc11.yellow(`tool_call${subtype ? `: ${subtype}` : ""}`));
    return;
  }
  const payload = asRecord2(toolCall[toolName]) ?? {};
  const args = payload.args ?? asRecord2(payload.function)?.arguments;
  const result = payload.result ?? payload.output ?? payload.error ?? asRecord2(payload.function)?.result ?? asRecord2(payload.function)?.output;
  const isError = parsed.is_error === true || payload.is_error === true || subtype === "failed" || subtype === "error" || subtype === "cancelled" || payload.error !== void 0;
  if (subtype === "started" || subtype === "start") {
    console.log(pc11.yellow(`tool_call: ${toolName}${callId ? ` (${callId})` : ""}`));
    if (args !== void 0) {
      console.log(pc11.gray(stringifyUnknown(args)));
    }
    return;
  }
  if (subtype === "completed" || subtype === "complete" || subtype === "finished") {
    const header = `tool_result${isError ? " (error)" : ""}${callId ? ` (${callId})` : ""}`;
    console.log((isError ? pc11.red : pc11.cyan)(header));
    if (result !== void 0) {
      console.log((isError ? pc11.red : pc11.gray)(stringifyUnknown(result)));
    }
    return;
  }
  console.log(pc11.yellow(`tool_call: ${toolName}${subtype ? ` (${subtype})` : ""}`));
}
function printLegacyToolEvent(part) {
  const tool = asString2(part.tool, "tool");
  const callId = asString2(part.callID, asString2(part.id, ""));
  const state = asRecord2(part.state);
  const status = asString2(state?.status);
  const input = state?.input;
  const output = asString2(state?.output).replace(/\s+$/, "");
  const metadata = asRecord2(state?.metadata);
  const exit = asNumber2(metadata?.exit, NaN);
  const isError = status === "failed" || status === "error" || status === "cancelled" || Number.isFinite(exit) && exit !== 0;
  console.log(pc11.yellow(`tool_call: ${tool}${callId ? ` (${callId})` : ""}`));
  if (input !== void 0) {
    try {
      console.log(pc11.gray(JSON.stringify(input, null, 2)));
    } catch {
      console.log(pc11.gray(String(input)));
    }
  }
  if (status || output) {
    const summary = [
      "tool_result",
      status ? `status=${status}` : "",
      Number.isFinite(exit) ? `exit=${exit}` : ""
    ].filter(Boolean).join(" ");
    console.log((isError ? pc11.red : pc11.cyan)(summary));
    if (output) {
      console.log((isError ? pc11.red : pc11.gray)(output));
    }
  }
}
function printCursorStreamEvent(raw, _debug) {
  const line = normalizeCursorStreamLine(raw).line;
  if (!line)
    return;
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    console.log(line);
    return;
  }
  const type = asString2(parsed.type);
  if (type === "system") {
    const subtype = asString2(parsed.subtype);
    if (subtype === "init") {
      const sessionId = asString2(parsed.session_id) || asString2(parsed.sessionId) || asString2(parsed.sessionID);
      const model = asString2(parsed.model);
      const details = [sessionId ? `session: ${sessionId}` : "", model ? `model: ${model}` : ""].filter(Boolean).join(", ");
      console.log(pc11.blue(`Cursor init${details ? ` (${details})` : ""}`));
      return;
    }
    console.log(pc11.blue(`system: ${subtype || "event"}`));
    return;
  }
  if (type === "assistant") {
    printAssistantMessage(parsed.message);
    return;
  }
  if (type === "user") {
    printUserMessage(parsed.message);
    return;
  }
  if (type === "thinking") {
    const text63 = asString2(parsed.text).trim() || asString2(asRecord2(parsed.delta)?.text).trim();
    if (text63)
      console.log(pc11.gray(`thinking: ${text63}`));
    return;
  }
  if (type === "tool_call") {
    printToolCallEventTopLevel(parsed);
    return;
  }
  if (type === "result") {
    const usage = asRecord2(parsed.usage);
    const input = asNumber2(usage?.input_tokens, asNumber2(usage?.inputTokens));
    const output = asNumber2(usage?.output_tokens, asNumber2(usage?.outputTokens));
    const cached = asNumber2(
      usage?.cached_input_tokens,
      asNumber2(usage?.cachedInputTokens, asNumber2(usage?.cache_read_input_tokens))
    );
    const cost = asNumber2(parsed.total_cost_usd, asNumber2(parsed.cost_usd, asNumber2(parsed.cost)));
    const subtype = asString2(parsed.subtype, "result");
    const isError = parsed.is_error === true || subtype === "error" || subtype === "failed";
    console.log(pc11.blue(`result: subtype=${subtype}`));
    console.log(pc11.blue(`tokens: in=${input} out=${output} cached=${cached} cost=$${cost.toFixed(6)}`));
    const resultText = asString2(parsed.result).trim();
    if (resultText)
      console.log((isError ? pc11.red : pc11.green)(`assistant: ${resultText}`));
    const errors = Array.isArray(parsed.errors) ? parsed.errors.map((value) => stringifyUnknown(value)).filter(Boolean) : [];
    if (errors.length > 0)
      console.log(pc11.red(`errors: ${errors.join(" | ")}`));
    return;
  }
  if (type === "error") {
    const message = asString2(parsed.message) || stringifyUnknown(parsed.error ?? parsed.detail) || line;
    console.log(pc11.red(`error: ${message}`));
    return;
  }
  if (type === "step_start") {
    const sessionId = asString2(parsed.sessionID);
    console.log(pc11.blue(`step started${sessionId ? ` (session: ${sessionId})` : ""}`));
    return;
  }
  if (type === "text") {
    const part = asRecord2(parsed.part);
    const text63 = asString2(part?.text);
    if (text63)
      console.log(pc11.green(`assistant: ${text63}`));
    return;
  }
  if (type === "tool_use") {
    const part = asRecord2(parsed.part);
    if (part) {
      printLegacyToolEvent(part);
    } else {
      console.log(pc11.yellow("tool_use"));
    }
    return;
  }
  if (type === "step_finish") {
    const part = asRecord2(parsed.part);
    const tokens = asRecord2(part?.tokens);
    const cache = asRecord2(tokens?.cache);
    const reason = asString2(part?.reason, "step_finish");
    const input = asNumber2(tokens?.input);
    const output = asNumber2(tokens?.output);
    const cached = asNumber2(cache?.read);
    const cost = asNumber2(part?.cost);
    console.log(pc11.blue(`step finished: reason=${reason}`));
    console.log(pc11.blue(`tokens: in=${input} out=${output} cached=${cached} cost=$${cost.toFixed(6)}`));
    return;
  }
  console.log(line);
}

// ../packages/adapters/gemini-local/src/cli/format-event.ts
import pc12 from "picocolors";
function asRecord3(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value;
}
function asString3(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asNumber3(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function stringifyUnknown2(value) {
  if (typeof value === "string")
    return value;
  if (value === null || value === void 0)
    return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function errorText2(value) {
  if (typeof value === "string")
    return value;
  const rec = asRecord3(value);
  if (!rec)
    return "";
  const msg = typeof rec.message === "string" && rec.message || typeof rec.error === "string" && rec.error || typeof rec.code === "string" && rec.code || "";
  if (msg)
    return msg;
  try {
    return JSON.stringify(rec);
  } catch {
    return "";
  }
}
function printTextMessage(prefix, colorize, messageRaw) {
  if (typeof messageRaw === "string") {
    const text63 = messageRaw.trim();
    if (text63)
      console.log(colorize(`${prefix}: ${text63}`));
    return;
  }
  const message = asRecord3(messageRaw);
  if (!message)
    return;
  const directText = asString3(message.text).trim();
  if (directText)
    console.log(colorize(`${prefix}: ${directText}`));
  const content = Array.isArray(message.content) ? message.content : [];
  for (const partRaw of content) {
    const part = asRecord3(partRaw);
    if (!part)
      continue;
    const type = asString3(part.type).trim();
    if (type === "output_text" || type === "text" || type === "content") {
      const text63 = asString3(part.text).trim() || asString3(part.content).trim();
      if (text63)
        console.log(colorize(`${prefix}: ${text63}`));
      continue;
    }
    if (type === "thinking") {
      const text63 = asString3(part.text).trim();
      if (text63)
        console.log(pc12.gray(`thinking: ${text63}`));
      continue;
    }
    if (type === "tool_call") {
      const name = asString3(part.name, asString3(part.tool, "tool"));
      console.log(pc12.yellow(`tool_call: ${name}`));
      const input = part.input ?? part.arguments ?? part.args;
      if (input !== void 0)
        console.log(pc12.gray(stringifyUnknown2(input)));
      continue;
    }
    if (type === "tool_result" || type === "tool_response") {
      const isError = part.is_error === true || asString3(part.status).toLowerCase() === "error";
      const contentText = asString3(part.output) || asString3(part.text) || asString3(part.result) || stringifyUnknown2(part.output ?? part.result ?? part.text ?? part.response);
      console.log((isError ? pc12.red : pc12.cyan)(`tool_result${isError ? " (error)" : ""}`));
      if (contentText)
        console.log((isError ? pc12.red : pc12.gray)(contentText));
    }
  }
}
function printUsage(parsed) {
  const usage = asRecord3(parsed.usage) ?? asRecord3(parsed.usageMetadata);
  const usageMetadata = asRecord3(usage?.usageMetadata);
  const source = usageMetadata ?? usage ?? {};
  const input = asNumber3(source.input_tokens, asNumber3(source.inputTokens, asNumber3(source.promptTokenCount)));
  const output = asNumber3(source.output_tokens, asNumber3(source.outputTokens, asNumber3(source.candidatesTokenCount)));
  const cached = asNumber3(
    source.cached_input_tokens,
    asNumber3(source.cachedInputTokens, asNumber3(source.cachedContentTokenCount))
  );
  const cost = asNumber3(parsed.total_cost_usd, asNumber3(parsed.cost_usd, asNumber3(parsed.cost)));
  console.log(pc12.blue(`tokens: in=${input} out=${output} cached=${cached} cost=$${cost.toFixed(6)}`));
}
function printGeminiStreamEvent(raw, _debug) {
  const line = raw.trim();
  if (!line)
    return;
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    console.log(line);
    return;
  }
  const type = asString3(parsed.type);
  if (type === "system") {
    const subtype = asString3(parsed.subtype);
    if (subtype === "init") {
      const sessionId = asString3(parsed.session_id) || asString3(parsed.sessionId) || asString3(parsed.sessionID) || asString3(parsed.checkpoint_id);
      const model = asString3(parsed.model);
      const details = [sessionId ? `session: ${sessionId}` : "", model ? `model: ${model}` : ""].filter(Boolean).join(", ");
      console.log(pc12.blue(`Gemini init${details ? ` (${details})` : ""}`));
      return;
    }
    if (subtype === "error") {
      const text63 = errorText2(parsed.error ?? parsed.message ?? parsed.detail);
      if (text63)
        console.log(pc12.red(`error: ${text63}`));
      return;
    }
    console.log(pc12.blue(`system: ${subtype || "event"}`));
    return;
  }
  if (type === "assistant") {
    printTextMessage("assistant", pc12.green, parsed.message);
    return;
  }
  if (type === "user") {
    printTextMessage("user", pc12.gray, parsed.message);
    return;
  }
  if (type === "thinking") {
    const text63 = asString3(parsed.text).trim() || asString3(asRecord3(parsed.delta)?.text).trim();
    if (text63)
      console.log(pc12.gray(`thinking: ${text63}`));
    return;
  }
  if (type === "tool_call") {
    const subtype = asString3(parsed.subtype).trim().toLowerCase();
    const toolCall = asRecord3(parsed.tool_call ?? parsed.toolCall);
    const [toolName] = toolCall ? Object.keys(toolCall) : [];
    if (!toolCall || !toolName) {
      console.log(pc12.yellow(`tool_call${subtype ? `: ${subtype}` : ""}`));
      return;
    }
    const payload = asRecord3(toolCall[toolName]) ?? {};
    if (subtype === "started" || subtype === "start") {
      console.log(pc12.yellow(`tool_call: ${toolName}`));
      console.log(pc12.gray(stringifyUnknown2(payload.args ?? payload.input ?? payload.arguments ?? payload)));
      return;
    }
    if (subtype === "completed" || subtype === "complete" || subtype === "finished") {
      const isError = parsed.is_error === true || payload.is_error === true || payload.error !== void 0 || asString3(payload.status).toLowerCase() === "error";
      console.log((isError ? pc12.red : pc12.cyan)(`tool_result${isError ? " (error)" : ""}`));
      console.log((isError ? pc12.red : pc12.gray)(stringifyUnknown2(payload.result ?? payload.output ?? payload.error)));
      return;
    }
    console.log(pc12.yellow(`tool_call: ${toolName}${subtype ? ` (${subtype})` : ""}`));
    return;
  }
  if (type === "result") {
    printUsage(parsed);
    const subtype = asString3(parsed.subtype, "result");
    const isError = parsed.is_error === true;
    if (subtype || isError) {
      console.log((isError ? pc12.red : pc12.blue)(`result: subtype=${subtype} is_error=${isError ? "true" : "false"}`));
    }
    return;
  }
  if (type === "error") {
    const text63 = errorText2(parsed.error ?? parsed.message ?? parsed.detail);
    if (text63)
      console.log(pc12.red(`error: ${text63}`));
    return;
  }
  console.log(line);
}

// ../packages/adapters/opencode-local/src/cli/format-event.ts
import pc13 from "picocolors";
function safeJsonParse(text63) {
  try {
    return JSON.parse(text63);
  } catch {
    return null;
  }
}
function asRecord4(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value;
}
function asString4(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asNumber4(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function errorText3(value) {
  if (typeof value === "string")
    return value;
  const rec = asRecord4(value);
  if (!rec)
    return "";
  const data = asRecord4(rec.data);
  const message = asString4(rec.message) || asString4(data?.message) || asString4(rec.name) || "";
  if (message)
    return message;
  try {
    return JSON.stringify(rec);
  } catch {
    return "";
  }
}
function printOpenCodeStreamEvent(raw, _debug) {
  const line = raw.trim();
  if (!line)
    return;
  const parsed = asRecord4(safeJsonParse(line));
  if (!parsed) {
    console.log(line);
    return;
  }
  const type = asString4(parsed.type);
  if (type === "step_start") {
    const sessionId = asString4(parsed.sessionID);
    console.log(pc13.blue(`step started${sessionId ? ` (session: ${sessionId})` : ""}`));
    return;
  }
  if (type === "text") {
    const part = asRecord4(parsed.part);
    const text63 = asString4(part?.text).trim();
    if (text63)
      console.log(pc13.green(`assistant: ${text63}`));
    return;
  }
  if (type === "reasoning") {
    const part = asRecord4(parsed.part);
    const text63 = asString4(part?.text).trim();
    if (text63)
      console.log(pc13.gray(`thinking: ${text63}`));
    return;
  }
  if (type === "tool_use") {
    const part = asRecord4(parsed.part);
    const tool = asString4(part?.tool, "tool");
    const callID = asString4(part?.callID);
    const state = asRecord4(part?.state);
    const status = asString4(state?.status);
    const isError = status === "error";
    const metadata = asRecord4(state?.metadata);
    console.log(pc13.yellow(`tool_call: ${tool}${callID ? ` (${callID})` : ""}`));
    if (status) {
      const metaParts = [`status=${status}`];
      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          if (value !== void 0 && value !== null)
            metaParts.push(`${key}=${value}`);
        }
      }
      console.log((isError ? pc13.red : pc13.gray)(`tool_result ${metaParts.join(" ")}`));
    }
    const output = (asString4(state?.output) || asString4(state?.error)).trim();
    if (output)
      console.log((isError ? pc13.red : pc13.gray)(output));
    return;
  }
  if (type === "step_finish") {
    const part = asRecord4(parsed.part);
    const tokens = asRecord4(part?.tokens);
    const cache = asRecord4(tokens?.cache);
    const input = asNumber4(tokens?.input, 0);
    const output = asNumber4(tokens?.output, 0) + asNumber4(tokens?.reasoning, 0);
    const cached = asNumber4(cache?.read, 0);
    const cost = asNumber4(part?.cost, 0);
    const reason = asString4(part?.reason, "step");
    console.log(pc13.blue(`step finished: reason=${reason}`));
    console.log(pc13.blue(`tokens: in=${input} out=${output} cached=${cached} cost=$${cost.toFixed(6)}`));
    return;
  }
  if (type === "error") {
    const message = errorText3(parsed.error ?? parsed.message);
    if (message)
      console.log(pc13.red(`error: ${message}`));
    return;
  }
  console.log(line);
}

// ../packages/adapters/pi-local/src/cli/format-event.ts
import pc14 from "picocolors";
function safeJsonParse2(text63) {
  try {
    return JSON.parse(text63);
  } catch {
    return null;
  }
}
function asRecord5(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value;
}
function asString5(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function extractTextContent(content) {
  if (typeof content === "string")
    return content;
  if (!Array.isArray(content))
    return "";
  return content.filter((c) => c.type === "text" && c.text).map((c) => c.text).join("");
}
function printPiStreamEvent(raw, _debug) {
  const line = raw.trim();
  if (!line)
    return;
  const parsed = asRecord5(safeJsonParse2(line));
  if (!parsed) {
    console.log(line);
    return;
  }
  const type = asString5(parsed.type);
  if (type === "agent_start") {
    console.log(pc14.blue("Pi agent started"));
    return;
  }
  if (type === "agent_end") {
    console.log(pc14.blue("Pi agent finished"));
    return;
  }
  if (type === "turn_start") {
    console.log(pc14.blue("Turn started"));
    return;
  }
  if (type === "turn_end") {
    const message = asRecord5(parsed.message);
    if (message) {
      const content = message.content;
      const text63 = extractTextContent(content);
      if (text63) {
        console.log(pc14.green(`assistant: ${text63}`));
      }
    }
    return;
  }
  if (type === "message_update") {
    const assistantEvent = asRecord5(parsed.assistantMessageEvent);
    if (assistantEvent) {
      const msgType = asString5(assistantEvent.type);
      if (msgType === "text_delta") {
        const delta = asString5(assistantEvent.delta);
        if (delta) {
          console.log(pc14.green(delta));
        }
      }
    }
    return;
  }
  if (type === "tool_execution_start") {
    const toolName = asString5(parsed.toolName);
    const args = parsed.args;
    console.log(pc14.yellow(`tool_start: ${toolName}`));
    if (args !== void 0) {
      try {
        console.log(pc14.gray(JSON.stringify(args, null, 2)));
      } catch {
        console.log(pc14.gray(String(args)));
      }
    }
    return;
  }
  if (type === "tool_execution_end") {
    const result = parsed.result;
    const isError = parsed.isError === true;
    const output = typeof result === "string" ? result : JSON.stringify(result);
    if (output) {
      console.log((isError ? pc14.red : pc14.gray)(output));
    }
    return;
  }
  console.log(line);
}

// ../packages/adapters/openclaw-gateway/src/cli/format-event.ts
import pc15 from "picocolors";
function printOpenClawGatewayStreamEvent(raw, debug) {
  const line = raw.trim();
  if (!line)
    return;
  if (!debug) {
    console.log(line);
    return;
  }
  if (line.startsWith("[openclaw-gateway:event]")) {
    console.log(pc15.cyan(line));
    return;
  }
  if (line.startsWith("[openclaw-gateway]")) {
    console.log(pc15.blue(line));
    return;
  }
  console.log(pc15.gray(line));
}

// src/adapters/process/format-event.ts
function printProcessStdoutEvent(raw, _debug) {
  const line = raw.trim();
  if (line)
    console.log(line);
}

// src/adapters/process/index.ts
var processCLIAdapter = {
  type: "process",
  formatStdoutEvent: printProcessStdoutEvent
};

// src/adapters/http/format-event.ts
function printHttpStdoutEvent(raw, _debug) {
  const line = raw.trim();
  if (line)
    console.log(line);
}

// src/adapters/http/index.ts
var httpCLIAdapter = {
  type: "http",
  formatStdoutEvent: printHttpStdoutEvent
};

// src/adapters/open-agents/format-event.ts
import pc16 from "picocolors";
var EVENT_PREFIXES = {
  sandbox_create: pc16.cyan("sandbox"),
  sandbox_resume: pc16.cyan("sandbox"),
  sandbox_hibernate: pc16.cyan("sandbox"),
  tool_start: pc16.yellow("tool"),
  tool_result: pc16.yellow("tool"),
  file_edit: pc16.green("file"),
  file_create: pc16.green("file"),
  shell_exec: pc16.magenta("shell"),
  search: pc16.blue("search"),
  git_commit: pc16.green("git"),
  git_push: pc16.green("git"),
  git_pr: pc16.green("git"),
  agent_message: pc16.white("agent"),
  agent_thinking: pc16.dim("think"),
  task_delegate: pc16.yellow("delegate"),
  workflow_step: pc16.blue("workflow"),
  error: pc16.red("error")
};
function printOpenAgentsStreamEvent(raw, _debug) {
  const line = raw.trim();
  if (!line)
    return;
  try {
    const event = JSON.parse(line);
    if (event.type && event.detail) {
      const prefix = EVENT_PREFIXES[event.type] ?? pc16.dim(event.type);
      console.log(`  ${prefix}  ${event.detail}`);
      return;
    }
  } catch {
  }
  console.log(line);
}

// src/adapters/open-agents/index.ts
var openAgentsCLIAdapter = {
  type: "open_agents",
  formatStdoutEvent: printOpenAgentsStreamEvent
};

// src/adapters/qwen/format-event.ts
function printQwenStreamEvent(raw, _debug) {
  const line = raw.trim();
  if (!line)
    return;
  try {
    const parsed = JSON.parse(line);
    if (parsed.type === "result" && typeof parsed.text === "string") {
      console.log(parsed.text);
      return;
    }
    if (parsed.type === "assistant" && typeof parsed.content === "string") {
      process.stdout.write(parsed.content);
      return;
    }
  } catch {
  }
  console.log(line);
}

// src/adapters/qwen/index.ts
var qwenLocalCLIAdapter = {
  type: "qwen_local",
  formatStdoutEvent: printQwenStreamEvent
};

// src/adapters/registry.ts
var claudeLocalCLIAdapter = {
  type: "claude_local",
  formatStdoutEvent: printClaudeStreamEvent
};
var codexLocalCLIAdapter = {
  type: "codex_local",
  formatStdoutEvent: printCodexStreamEvent
};
var openCodeLocalCLIAdapter = {
  type: "opencode_local",
  formatStdoutEvent: printOpenCodeStreamEvent
};
var piLocalCLIAdapter = {
  type: "pi_local",
  formatStdoutEvent: printPiStreamEvent
};
var cursorLocalCLIAdapter = {
  type: "cursor",
  formatStdoutEvent: printCursorStreamEvent
};
var geminiLocalCLIAdapter = {
  type: "gemini_local",
  formatStdoutEvent: printGeminiStreamEvent
};
var openclawGatewayCLIAdapter = {
  type: "openclaw_gateway",
  formatStdoutEvent: printOpenClawGatewayStreamEvent
};
var adaptersByType = new Map(
  [
    claudeLocalCLIAdapter,
    codexLocalCLIAdapter,
    openCodeLocalCLIAdapter,
    piLocalCLIAdapter,
    cursorLocalCLIAdapter,
    geminiLocalCLIAdapter,
    openclawGatewayCLIAdapter,
    openAgentsCLIAdapter,
    qwenLocalCLIAdapter,
    processCLIAdapter,
    httpCLIAdapter
  ].map((a) => [a.type, a])
);
function getCLIAdapter(type) {
  return adaptersByType.get(type) ?? processCLIAdapter;
}

// src/commands/client/common.ts
init_store();
import pc17 from "picocolors";

// src/client/context.ts
init_home();
import fs10 from "node:fs";
import path9 from "node:path";
var DEFAULT_CONTEXT_BASENAME = "context.json";
var DEFAULT_PROFILE = "default";
function findContextFileFromAncestors(startDir) {
  const absoluteStartDir = path9.resolve(startDir);
  let currentDir = absoluteStartDir;
  while (true) {
    const candidate = path9.resolve(currentDir, ".paperclip", DEFAULT_CONTEXT_BASENAME);
    if (fs10.existsSync(candidate)) {
      return candidate;
    }
    const nextDir = path9.resolve(currentDir, "..");
    if (nextDir === currentDir)
      break;
    currentDir = nextDir;
  }
  return null;
}
function resolveContextPath(overridePath) {
  if (overridePath)
    return path9.resolve(overridePath);
  if (process.env.PAPERCLIP_CONTEXT)
    return path9.resolve(process.env.PAPERCLIP_CONTEXT);
  return findContextFileFromAncestors(process.cwd()) ?? resolveDefaultContextPath();
}
function defaultClientContext() {
  return {
    version: 1,
    currentProfile: DEFAULT_PROFILE,
    profiles: {
      [DEFAULT_PROFILE]: {}
    }
  };
}
function parseJson2(filePath) {
  try {
    return JSON.parse(fs10.readFileSync(filePath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function toStringOrUndefined(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function normalizeProfile(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  const profile = value;
  return {
    apiBase: toStringOrUndefined(profile.apiBase),
    companyId: toStringOrUndefined(profile.companyId),
    apiKeyEnvVarName: toStringOrUndefined(profile.apiKeyEnvVarName)
  };
}
function normalizeContext(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return defaultClientContext();
  }
  const record = raw;
  const version = record.version === 1 ? 1 : 1;
  const currentProfile = toStringOrUndefined(record.currentProfile) ?? DEFAULT_PROFILE;
  const rawProfiles = record.profiles;
  const profiles = {};
  if (typeof rawProfiles === "object" && rawProfiles !== null && !Array.isArray(rawProfiles)) {
    for (const [name, profile] of Object.entries(rawProfiles)) {
      if (!name.trim())
        continue;
      profiles[name] = normalizeProfile(profile);
    }
  }
  if (!profiles[currentProfile]) {
    profiles[currentProfile] = {};
  }
  if (Object.keys(profiles).length === 0) {
    profiles[DEFAULT_PROFILE] = {};
  }
  return {
    version,
    currentProfile,
    profiles
  };
}
function readContext(contextPath) {
  const filePath = resolveContextPath(contextPath);
  if (!fs10.existsSync(filePath)) {
    return defaultClientContext();
  }
  const raw = parseJson2(filePath);
  return normalizeContext(raw);
}
function writeContext(context, contextPath) {
  const filePath = resolveContextPath(contextPath);
  const dir = path9.dirname(filePath);
  fs10.mkdirSync(dir, { recursive: true });
  const normalized = normalizeContext(context);
  fs10.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}
`, { mode: 384 });
}
function upsertProfile(profileName, patch, contextPath) {
  const context = readContext(contextPath);
  const existing = context.profiles[profileName] ?? {};
  const merged = {
    ...existing,
    ...patch
  };
  if (patch.apiBase !== void 0 && patch.apiBase.trim().length === 0) {
    delete merged.apiBase;
  }
  if (patch.companyId !== void 0 && patch.companyId.trim().length === 0) {
    delete merged.companyId;
  }
  if (patch.apiKeyEnvVarName !== void 0 && patch.apiKeyEnvVarName.trim().length === 0) {
    delete merged.apiKeyEnvVarName;
  }
  context.profiles[profileName] = merged;
  context.currentProfile = context.currentProfile || profileName;
  writeContext(context, contextPath);
  return context;
}
function setCurrentProfile(profileName, contextPath) {
  const context = readContext(contextPath);
  if (!context.profiles[profileName]) {
    context.profiles[profileName] = {};
  }
  context.currentProfile = profileName;
  writeContext(context, contextPath);
  return context;
}
function resolveProfile(context, profileName) {
  const name = profileName?.trim() || context.currentProfile || DEFAULT_PROFILE;
  const profile = context.profiles[name] ?? {};
  return { name, profile };
}

// src/client/http.ts
import { URL as URL2 } from "node:url";
var ApiRequestError = class extends Error {
  status;
  details;
  body;
  constructor(status, message, details, body) {
    super(message);
    this.status = status;
    this.details = details;
    this.body = body;
  }
};
var PaperclipApiClient = class {
  apiBase;
  apiKey;
  runId;
  userId;
  constructor(opts) {
    this.apiBase = opts.apiBase.replace(/\/+$/, "");
    this.apiKey = opts.apiKey?.trim() || void 0;
    this.runId = opts.runId?.trim() || void 0;
    this.userId = opts.userId?.trim() || void 0;
  }
  get(path36, opts) {
    return this.request(path36, { method: "GET" }, opts);
  }
  post(path36, body, opts) {
    return this.request(path36, {
      method: "POST",
      body: body === void 0 ? void 0 : JSON.stringify(body)
    }, opts);
  }
  patch(path36, body, opts) {
    return this.request(path36, {
      method: "PATCH",
      body: body === void 0 ? void 0 : JSON.stringify(body)
    }, opts);
  }
  delete(path36, opts) {
    return this.request(path36, { method: "DELETE" }, opts);
  }
  async request(path36, init, opts) {
    const url = buildUrl(this.apiBase, path36);
    const headers = {
      accept: "application/json",
      ...toStringRecord(init.headers)
    };
    if (init.body !== void 0) {
      headers["content-type"] = headers["content-type"] ?? "application/json";
    }
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    if (this.runId) {
      headers["x-paperclip-run-id"] = this.runId;
    }
    if (this.userId) {
      headers["x-user-id"] = this.userId;
    }
    const response = await fetch(url, {
      ...init,
      headers
    });
    if (opts?.ignoreNotFound && response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw await toApiError(response);
    }
    if (response.status === 204) {
      return null;
    }
    const text63 = await response.text();
    if (!text63.trim()) {
      return null;
    }
    return safeParseJson(text63);
  }
};
function buildUrl(apiBase, path36) {
  const normalizedPath = path36.startsWith("/") ? path36 : `/${path36}`;
  const [pathname, query] = normalizedPath.split("?");
  const url = new URL2(apiBase);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${pathname}`;
  if (query)
    url.search = query;
  return url.toString();
}
function safeParseJson(text63) {
  try {
    return JSON.parse(text63);
  } catch {
    return text63;
  }
}
async function toApiError(response) {
  const text63 = await response.text();
  const parsed = safeParseJson(text63);
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const body = parsed;
    const message = typeof body.error === "string" && body.error.trim() || typeof body.message === "string" && body.message.trim() || `Request failed with status ${response.status}`;
    return new ApiRequestError(response.status, message, body.details, parsed);
  }
  return new ApiRequestError(response.status, `Request failed with status ${response.status}`, void 0, parsed);
}
function toStringRecord(headers) {
  if (!headers)
    return {};
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, String(value)]));
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)])
  );
}

// src/commands/client/common.ts
function addCommonClientOptions(command, opts) {
  command.option("-c, --config <path>", "Path to Growthub config file").option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)").option("--context <path>", "Path to CLI context file").option("--profile <name>", "CLI context profile name").option("--api-base <url>", "Base URL for the Growthub API").option("--api-key <token>", "Bearer token for agent-authenticated calls").option("--json", "Output raw JSON");
  if (opts?.includeCompany) {
    command.option("-C, --company-id <id>", "Company ID (overrides context default)");
  }
  return command;
}
function resolveCommandContext(options, opts) {
  const context = readContext(options.context);
  const { name: profileName, profile } = resolveProfile(context, options.profile);
  const apiBase = options.apiBase?.trim() || process.env.PAPERCLIP_API_URL?.trim() || profile.apiBase || inferApiBaseFromConfig(options.config);
  const apiKey = options.apiKey?.trim() || process.env.PAPERCLIP_API_KEY?.trim() || readKeyFromProfileEnv(profile);
  const companyId = options.companyId?.trim() || process.env.PAPERCLIP_COMPANY_ID?.trim() || profile.companyId;
  if (opts?.requireCompany && !companyId) {
    throw new Error(
      "Company ID is required. Pass --company-id, set PAPERCLIP_COMPANY_ID, or set context profile companyId via `growthub context set`."
    );
  }
  const api = new PaperclipApiClient({ apiBase, apiKey });
  return {
    api,
    companyId,
    profileName,
    profile,
    json: Boolean(options.json)
  };
}
function printOutput(data, opts = {}) {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (opts.label) {
    console.log(pc17.bold(opts.label));
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log(pc17.dim("(empty)"));
      return;
    }
    for (const item of data) {
      if (typeof item === "object" && item !== null) {
        console.log(formatInlineRecord(item));
      } else {
        console.log(String(item));
      }
    }
    return;
  }
  if (typeof data === "object" && data !== null) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data === void 0 || data === null) {
    console.log(pc17.dim("(null)"));
    return;
  }
  console.log(String(data));
}
function formatInlineRecord(record) {
  const keyOrder = ["identifier", "id", "name", "status", "priority", "title", "action"];
  const seen = /* @__PURE__ */ new Set();
  const parts = [];
  for (const key of keyOrder) {
    if (!(key in record))
      continue;
    parts.push(`${key}=${renderValue(record[key])}`);
    seen.add(key);
  }
  for (const [key, value] of Object.entries(record)) {
    if (seen.has(key))
      continue;
    if (typeof value === "object")
      continue;
    parts.push(`${key}=${renderValue(value)}`);
  }
  return parts.join(" ");
}
function renderValue(value) {
  if (value === null || value === void 0)
    return "-";
  if (typeof value === "string") {
    const compact = value.replace(/\s+/g, " ").trim();
    return compact.length > 90 ? `${compact.slice(0, 87)}...` : compact;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "[object]";
}
function inferApiBaseFromConfig(configPath) {
  const envHost = process.env.PAPERCLIP_SERVER_HOST?.trim() || "localhost";
  let port = Number(process.env.PAPERCLIP_SERVER_PORT || "");
  if (!Number.isFinite(port) || port <= 0) {
    try {
      const config = readConfig(configPath);
      port = Number(config?.server?.port ?? 3100);
    } catch {
      port = 3100;
    }
  }
  if (!Number.isFinite(port) || port <= 0) {
    port = 3100;
  }
  return `http://${envHost}:${port}`;
}
function readKeyFromProfileEnv(profile) {
  if (!profile.apiKeyEnvVarName)
    return void 0;
  return process.env[profile.apiKeyEnvVarName]?.trim() || void 0;
}
function handleCommandError(error) {
  if (error instanceof ApiRequestError) {
    const detailSuffix = error.details !== void 0 ? ` details=${JSON.stringify(error.details)}` : "";
    console.error(pc17.red(`API error ${error.status}: ${error.message}${detailSuffix}`));
    process.exit(1);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc17.red(message));
  process.exit(1);
}

// src/commands/heartbeat-run.ts
var HEARTBEAT_SOURCES = ["timer", "assignment", "on_demand", "automation"];
var HEARTBEAT_TRIGGERS = ["manual", "ping", "callback", "system"];
var TERMINAL_STATUSES = /* @__PURE__ */ new Set(["succeeded", "failed", "cancelled", "timed_out"]);
var POLL_INTERVAL_MS = 200;
function asRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function asErrorText2(value) {
  if (typeof value === "string")
    return value;
  const obj = asRecord6(value);
  if (!obj)
    return "";
  const message = typeof obj.message === "string" && obj.message || typeof obj.error === "string" && obj.error || typeof obj.code === "string" && obj.code || "";
  if (message)
    return message;
  try {
    return JSON.stringify(obj);
  } catch {
    return "";
  }
}
async function heartbeatRun(opts) {
  const debug = Boolean(opts.debug);
  const parsedTimeout = Number.parseInt(opts.timeoutMs, 10);
  const timeoutMs = Number.isFinite(parsedTimeout) ? parsedTimeout : 0;
  const source = HEARTBEAT_SOURCES.includes(opts.source) ? opts.source : "on_demand";
  const triggerDetail = HEARTBEAT_TRIGGERS.includes(opts.trigger) ? opts.trigger : "manual";
  const ctx = resolveCommandContext({
    config: opts.config,
    context: opts.context,
    profile: opts.profile,
    apiBase: opts.apiBase,
    apiKey: opts.apiKey,
    json: opts.json
  });
  const api = ctx.api;
  const agent = await api.get(`/api/agents/${opts.agentId}`);
  if (!agent || typeof agent !== "object" || !agent.id) {
    console.error(pc18.red(`Agent not found: ${opts.agentId}`));
    return;
  }
  const invokeRes = await api.post(
    `/api/agents/${opts.agentId}/wakeup`,
    {
      source,
      triggerDetail
    }
  );
  if (!invokeRes) {
    console.error(pc18.red("Failed to invoke heartbeat"));
    return;
  }
  if (invokeRes.status === "skipped") {
    console.log(pc18.yellow("Heartbeat invocation was skipped"));
    return;
  }
  const run = invokeRes;
  console.log(pc18.cyan(`Invoked heartbeat run ${run.id} for agent ${agent.name} (${agent.id})`));
  const runId = run.id;
  let activeRunId = null;
  let lastEventSeq = 0;
  let logOffset = 0;
  let stdoutJsonBuffer = "";
  const printRawChunk = (stream, chunk) => {
    if (stream === "stdout")
      process.stdout.write(pc18.green("[stdout] ") + chunk);
    else if (stream === "stderr")
      process.stdout.write(pc18.red("[stderr] ") + chunk);
    else
      process.stdout.write(pc18.yellow("[system] ") + chunk);
  };
  const printAdapterInvoke = (payload) => {
    const adapterType2 = typeof payload.adapterType === "string" ? payload.adapterType : "unknown";
    const command = typeof payload.command === "string" ? payload.command : "";
    const cwd = typeof payload.cwd === "string" ? payload.cwd : "";
    const args = Array.isArray(payload.commandArgs) && payload.commandArgs.every((v) => typeof v === "string") ? payload.commandArgs : [];
    const env = typeof payload.env === "object" && payload.env !== null && !Array.isArray(payload.env) ? payload.env : null;
    const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
    const context = typeof payload.context === "object" && payload.context !== null && !Array.isArray(payload.context) ? payload.context : null;
    console.log(pc18.cyan(`Adapter: ${adapterType2}`));
    if (cwd)
      console.log(pc18.cyan(`Working dir: ${cwd}`));
    if (command) {
      const rendered = args.length > 0 ? `${command} ${args.join(" ")}` : command;
      console.log(pc18.cyan(`Command: ${rendered}`));
    }
    if (env) {
      console.log(pc18.cyan("Env:"));
      console.log(pc18.gray(JSON.stringify(env, null, 2)));
    }
    if (context) {
      console.log(pc18.cyan("Context:"));
      console.log(pc18.gray(JSON.stringify(context, null, 2)));
    }
    if (prompt) {
      console.log(pc18.cyan("Prompt:"));
      console.log(prompt);
    }
  };
  const adapterType = agent.adapterType ?? "claude_local";
  const cliAdapter = getCLIAdapter(adapterType);
  const handleStreamChunk = (stream, chunk) => {
    if (debug) {
      printRawChunk(stream, chunk);
      return;
    }
    if (stream !== "stdout") {
      printRawChunk(stream, chunk);
      return;
    }
    const combined = stdoutJsonBuffer + chunk;
    const lines = combined.split(/\r?\n/);
    stdoutJsonBuffer = lines.pop() ?? "";
    for (const line of lines) {
      cliAdapter.formatStdoutEvent(line, debug);
    }
  };
  const handleEvent = (event) => {
    const payload = normalizePayload(event.payload);
    if (event.runId !== runId)
      return;
    const eventType = typeof event.eventType === "string" ? event.eventType : typeof event.type === "string" ? event.type : "";
    if (eventType === "heartbeat.run.status") {
      const status = typeof payload.status === "string" ? payload.status : null;
      if (status) {
        console.log(pc18.blue(`[status] ${status}`));
      }
    } else if (eventType === "adapter.invoke") {
      printAdapterInvoke(payload);
    } else if (eventType === "heartbeat.run.log") {
      const stream = typeof payload.stream === "string" ? payload.stream : "system";
      const chunk = typeof payload.chunk === "string" ? payload.chunk : "";
      if (!chunk)
        return;
      if (stream === "stdout" || stream === "stderr" || stream === "system") {
        handleStreamChunk(stream, chunk);
      }
    } else if (typeof event.message === "string") {
      console.log(pc18.gray(`[event] ${eventType || "heartbeat.run.event"}: ${event.message}`));
    }
    lastEventSeq = Math.max(lastEventSeq, event.seq ?? 0);
  };
  activeRunId = runId;
  let finalStatus = null;
  let finalError = null;
  let finalRun = null;
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : null;
  if (!activeRunId) {
    console.error(pc18.red("Failed to capture heartbeat run id"));
    return;
  }
  while (true) {
    const events = await api.get(
      `/api/heartbeat-runs/${activeRunId}/events?afterSeq=${lastEventSeq}&limit=100`
    );
    for (const event of Array.isArray(events) ? events : []) {
      handleEvent(event);
    }
    const runList = await api.get(
      `/api/companies/${agent.companyId}/heartbeat-runs?agentId=${agent.id}`
    ) || [];
    const currentRun = runList.find((r) => r && r.id === activeRunId) ?? null;
    if (!currentRun) {
      console.error(pc18.red("Heartbeat run disappeared"));
      break;
    }
    const currentStatus = currentRun.status;
    if (currentStatus !== finalStatus && currentStatus) {
      finalStatus = currentStatus;
      console.log(pc18.blue(`Status: ${currentStatus}`));
    }
    if (currentStatus && TERMINAL_STATUSES.has(currentStatus)) {
      finalStatus = currentRun.status;
      finalError = currentRun.error;
      finalRun = currentRun;
      break;
    }
    if (deadline && Date.now() >= deadline) {
      finalError = `CLI timed out after ${timeoutMs}ms`;
      finalStatus = "timed_out";
      console.error(pc18.yellow(finalError));
      break;
    }
    const logResult = await api.get(
      `/api/heartbeat-runs/${activeRunId}/log?offset=${logOffset}&limitBytes=16384`,
      { ignoreNotFound: true }
    );
    if (logResult && logResult.content) {
      for (const chunk of logResult.content.split(/\r?\n/)) {
        if (!chunk)
          continue;
        const parsed = safeParseLogLine(chunk);
        if (!parsed)
          continue;
        handleStreamChunk(parsed.stream, parsed.chunk);
      }
      if (typeof logResult.nextOffset === "number") {
        logOffset = logResult.nextOffset;
      } else if (logResult.content) {
        logOffset += Buffer.byteLength(logResult.content, "utf8");
      }
    }
    await delay(POLL_INTERVAL_MS);
  }
  if (finalStatus) {
    if (!debug && stdoutJsonBuffer.trim()) {
      cliAdapter.formatStdoutEvent(stdoutJsonBuffer, debug);
      stdoutJsonBuffer = "";
    }
    const label = `Run ${activeRunId} completed with status ${finalStatus}`;
    if (finalStatus === "succeeded") {
      console.log(pc18.green(label));
      return;
    }
    console.log(pc18.red(label));
    if (finalError) {
      console.log(pc18.red(`Error: ${finalError}`));
    }
    if (finalRun) {
      const resultObj = asRecord6(finalRun.resultJson);
      if (resultObj) {
        const subtype = typeof resultObj.subtype === "string" ? resultObj.subtype : "";
        const isError = resultObj.is_error === true;
        const errors = Array.isArray(resultObj.errors) ? resultObj.errors.map(asErrorText2).filter(Boolean) : [];
        const resultText = typeof resultObj.result === "string" ? resultObj.result.trim() : "";
        if (subtype || isError || errors.length > 0 || resultText) {
          console.log(pc18.red("Claude result details:"));
          if (subtype)
            console.log(pc18.red(`  subtype: ${subtype}`));
          if (isError)
            console.log(pc18.red("  is_error: true"));
          if (errors.length > 0)
            console.log(pc18.red(`  errors: ${errors.join(" | ")}`));
          if (resultText)
            console.log(pc18.red(`  result: ${resultText}`));
        }
      }
      const stderrExcerpt = typeof finalRun.stderrExcerpt === "string" ? finalRun.stderrExcerpt.trim() : "";
      const stdoutExcerpt = typeof finalRun.stdoutExcerpt === "string" ? finalRun.stdoutExcerpt.trim() : "";
      if (stderrExcerpt) {
        console.log(pc18.red("stderr excerpt:"));
        console.log(stderrExcerpt);
      }
      if (stdoutExcerpt && (debug || !stderrExcerpt)) {
        console.log(pc18.gray("stdout excerpt:"));
        console.log(stdoutExcerpt);
      }
    }
    process.exitCode = 1;
  } else {
    process.exitCode = 1;
    console.log(pc18.gray("Heartbeat stream ended without terminal status"));
  }
}
function normalizePayload(payload) {
  return typeof payload === "object" && payload !== null ? payload : {};
}
function safeParseLogLine(line) {
  try {
    const parsed = JSON.parse(line);
    const stream = parsed.stream === "stdout" || parsed.stream === "stderr" || parsed.stream === "system" ? parsed.stream : "system";
    const chunk = typeof parsed.chunk === "string" ? parsed.chunk : "";
    if (!chunk)
      return null;
    return { stream, chunk };
  } catch {
    return null;
  }
}

// src/index.ts
init_run();
init_auth_bootstrap_ceo();

// src/commands/auth-login.ts
init_store();
init_env();
import os3 from "node:os";
import * as p14 from "@clack/prompts";
import pc19 from "picocolors";
import open from "open";

// src/auth/login-flow.ts
import { createServer } from "node:http";
import { randomBytes as randomBytes5 } from "node:crypto";
import os2 from "node:os";
import { URL as URL3 } from "node:url";
var DEFAULT_HOSTED_LOGIN_PATH = "/cli/login";
var CALLBACK_PATH = "/cli-callback";
function randomState() {
  return randomBytes5(16).toString("hex");
}
function trimSlashes(value) {
  return value.replace(/\/+$/, "");
}
function pickParam(url, name) {
  const value = url.searchParams.get(name);
  if (value === null)
    return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function renderSuccessPage(hostedBaseUrl) {
  const safeBase = hostedBaseUrl.replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Growthub CLI connected</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #0b0f14; color: #f5f7fa; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { width: min(560px, 100%); background: #121821; border: 1px solid #263244; border-radius: 16px; padding: 24px; box-sizing: border-box; }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { margin: 0 0 12px; line-height: 1.5; color: #c7d2e0; }
      a { color: #7dd3fc; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Growthub CLI connected</h1>
        <p>Your local CLI now has a hosted session token. You can close this tab and return to your terminal.</p>
        <p>Hosted app: <a href="${safeBase}">${safeBase}</a></p>
      </section>
    </main>
    <script>window.setTimeout(() => { try { window.close(); } catch {} }, 1200);</script>
  </body>
</html>`;
}
function renderErrorPage(message) {
  const safeMessage = message.replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Growthub CLI login error</title></head>
<body style="font-family: ui-sans-serif, system-ui, sans-serif; background: #0b0f14; color: #f5f7fa; padding: 24px;">
  <h1>Login error</h1>
  <p>${safeMessage}</p>
  <p>Return to your terminal and try again.</p>
</body></html>`;
}
function listenOnEphemeralLoopback(server) {
  return new Promise((resolve2, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind loopback port for CLI auth callback."));
        return;
      }
      resolve2(address.port);
    });
  });
}
async function startLoginFlow(opts) {
  const hostedBaseUrl = trimSlashes(opts.hostedBaseUrl);
  if (!hostedBaseUrl) {
    throw new Error("hostedBaseUrl is required to start the CLI login flow.");
  }
  try {
    new URL3(hostedBaseUrl);
  } catch {
    throw new Error(`Invalid hosted base URL: ${opts.hostedBaseUrl}`);
  }
  const state = randomState();
  const machineLabel = opts.machineLabel?.trim() || os2.hostname();
  const workspaceLabel = opts.workspaceLabel?.trim();
  const timeoutMs = Math.max(3e4, opts.timeoutMs ?? 5 * 6e4);
  let resolver = null;
  let rejecter = null;
  const waitPromise = new Promise((resolve2, reject) => {
    resolver = resolve2;
    rejecter = reject;
  });
  const server = createServer((req, res) => {
    try {
      const host = req.headers.host ?? "127.0.0.1";
      const requestUrl = new URL3(req.url ?? "/", `http://${host}`);
      if (requestUrl.pathname !== CALLBACK_PATH) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const incomingState = pickParam(requestUrl, "state");
      if (!incomingState || incomingState !== state) {
        res.statusCode = 400;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(renderErrorPage("State token mismatch. Restart `growthub auth login`."));
        rejecter?.(new Error("CLI auth callback rejected \u2014 state mismatch."));
        return;
      }
      const error = pickParam(requestUrl, "error");
      if (error) {
        res.statusCode = 400;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(renderErrorPage(error));
        rejecter?.(new Error(`Hosted app reported login error: ${error}`));
        return;
      }
      const token = pickParam(requestUrl, "token");
      if (!token) {
        res.statusCode = 400;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(renderErrorPage("Missing token in callback."));
        rejecter?.(new Error("CLI auth callback missing token."));
        return;
      }
      const result = {
        state,
        token,
        hostedBaseUrl,
        expiresAt: pickParam(requestUrl, "expiresAt"),
        userId: pickParam(requestUrl, "userId"),
        email: pickParam(requestUrl, "email"),
        orgId: pickParam(requestUrl, "orgId"),
        orgName: pickParam(requestUrl, "orgName"),
        machineLabel: pickParam(requestUrl, "machineLabel") ?? machineLabel
      };
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(renderSuccessPage(hostedBaseUrl));
      resolver?.(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 500;
      res.end(message);
      rejecter?.(err instanceof Error ? err : new Error(message));
    }
  });
  const port = await listenOnEphemeralLoopback(server);
  const callbackUrl = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  const hostedLoginPath = opts.hostedLoginPath ?? DEFAULT_HOSTED_LOGIN_PATH;
  const loginUrl = (() => {
    const url = new URL3(hostedLoginPath, `${hostedBaseUrl}/`);
    url.searchParams.set("state", state);
    url.searchParams.set("callback", callbackUrl);
    url.searchParams.set("machineLabel", machineLabel);
    if (workspaceLabel)
      url.searchParams.set("workspaceLabel", workspaceLabel);
    url.searchParams.set("source", "cli");
    return url.toString();
  })();
  let timeoutHandle = setTimeout(() => {
    rejecter?.(new Error(`CLI login timed out after ${Math.round(timeoutMs / 1e3)}s.`));
  }, timeoutMs);
  if (typeof timeoutHandle.unref === "function")
    timeoutHandle.unref();
  const close = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    server.close();
  };
  const waitForCallback = async () => {
    try {
      const result = await waitPromise;
      return result;
    } finally {
      close();
    }
  };
  return {
    state,
    callbackUrl,
    loginUrl,
    waitForCallback,
    close
  };
}

// src/auth/session-store.ts
import fs11 from "node:fs";
import path11 from "node:path";

// src/auth/paths.ts
init_home();
import path10 from "node:path";
function resolveAuthDir() {
  return path10.resolve(resolvePaperclipHomeDir(), "auth");
}
function resolveProfilesDir() {
  return path10.resolve(resolvePaperclipHomeDir(), "profiles");
}
function resolveSessionPath() {
  return path10.resolve(resolveAuthDir(), "session.json");
}
function resolveHostedOverlayPath() {
  return path10.resolve(resolveProfilesDir(), "hosted-overlay.json");
}
function resolveEffectiveProfilePath() {
  return path10.resolve(resolveProfilesDir(), "effective-profile.json");
}

// src/auth/session-store.ts
function parseJson3(filePath) {
  try {
    return JSON.parse(fs11.readFileSync(filePath, "utf-8"));
  } catch (err) {
    throw new Error(
      `Failed to parse auth session at ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
function toStringOrUndefined2(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function normalizeSession(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const record = raw;
  const accessToken = toStringOrUndefined2(record.accessToken);
  const hostedBaseUrl = toStringOrUndefined2(record.hostedBaseUrl);
  if (!accessToken || !hostedBaseUrl)
    return null;
  const issuedAt = toStringOrUndefined2(record.issuedAt) ?? (/* @__PURE__ */ new Date()).toISOString();
  return {
    version: 1,
    hostedBaseUrl,
    accessToken,
    expiresAt: toStringOrUndefined2(record.expiresAt),
    userId: toStringOrUndefined2(record.userId),
    email: toStringOrUndefined2(record.email),
    orgId: toStringOrUndefined2(record.orgId),
    orgName: toStringOrUndefined2(record.orgName),
    machineLabel: toStringOrUndefined2(record.machineLabel),
    issuedAt
  };
}
function readSession() {
  const filePath = resolveSessionPath();
  if (!fs11.existsSync(filePath))
    return null;
  const raw = parseJson3(filePath);
  return normalizeSession(raw);
}
function writeSession(session) {
  const filePath = resolveSessionPath();
  fs11.mkdirSync(resolveAuthDir(), { recursive: true });
  fs11.writeFileSync(filePath, `${JSON.stringify(session, null, 2)}
`, { mode: 384 });
  try {
    fs11.chmodSync(filePath, 384);
  } catch {
  }
}
function clearSession() {
  const filePath = resolveSessionPath();
  if (!fs11.existsSync(filePath))
    return false;
  fs11.rmSync(filePath, { force: true });
  return true;
}
function isSessionExpired(session, now = /* @__PURE__ */ new Date()) {
  if (!session.expiresAt)
    return false;
  const expires = Date.parse(session.expiresAt);
  if (Number.isNaN(expires))
    return false;
  return expires <= now.getTime();
}
function describeSessionPath() {
  return path11.resolve(resolveSessionPath());
}

// src/auth/overlay-store.ts
import fs12 from "node:fs";
import path12 from "node:path";
function parseJson4(filePath) {
  try {
    return JSON.parse(fs12.readFileSync(filePath, "utf-8"));
  } catch (err) {
    throw new Error(
      `Failed to parse hosted overlay at ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
function toStringOrUndefined3(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function toStringArray(value) {
  if (!Array.isArray(value))
    return [];
  const out = [];
  for (const item of value) {
    const normalized = toStringOrUndefined3(item);
    if (normalized && !out.includes(normalized))
      out.push(normalized);
  }
  return out;
}
function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return void 0;
  return value;
}
function normalizeExecutionDefaults(value) {
  const record = toRecord(value) ?? {};
  const modeRaw = toStringOrUndefined3(record.preferredMode);
  const preferredMode = modeRaw === "local" || modeRaw === "serverless" || modeRaw === "browser" || modeRaw === "auto" ? modeRaw : "local";
  return {
    preferredMode,
    allowServerlessFallback: typeof record.allowServerlessFallback === "boolean" ? record.allowServerlessFallback : false,
    allowBrowserBridge: typeof record.allowBrowserBridge === "boolean" ? record.allowBrowserBridge : false
  };
}
function defaultExecutionPreferences() {
  return {
    preferredMode: "local",
    allowServerlessFallback: false,
    allowBrowserBridge: false
  };
}
function normalizeOverlay(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const record = raw;
  const hostedBaseUrl = toStringOrUndefined3(record.hostedBaseUrl);
  if (!hostedBaseUrl)
    return null;
  return {
    version: 1,
    hostedBaseUrl,
    userId: toStringOrUndefined3(record.userId),
    email: toStringOrUndefined3(record.email),
    displayName: toStringOrUndefined3(record.displayName),
    orgId: toStringOrUndefined3(record.orgId),
    orgName: toStringOrUndefined3(record.orgName),
    entitlements: toStringArray(record.entitlements),
    gatedKitSlugs: toStringArray(record.gatedKitSlugs),
    executionDefaults: normalizeExecutionDefaults(record.executionDefaults),
    linkedInstanceId: toStringOrUndefined3(record.linkedInstanceId),
    lastPulledAt: toStringOrUndefined3(record.lastPulledAt),
    lastPushedAt: toStringOrUndefined3(record.lastPushedAt),
    extra: toRecord(record.extra)
  };
}
function readHostedOverlay() {
  const filePath = resolveHostedOverlayPath();
  if (!fs12.existsSync(filePath))
    return null;
  return normalizeOverlay(parseJson4(filePath));
}
function writeHostedOverlay(overlay) {
  const filePath = resolveHostedOverlayPath();
  fs12.mkdirSync(resolveProfilesDir(), { recursive: true });
  fs12.writeFileSync(filePath, `${JSON.stringify(overlay, null, 2)}
`, { mode: 384 });
  try {
    fs12.chmodSync(filePath, 384);
  } catch {
  }
}
function clearHostedOverlay() {
  const filePath = resolveHostedOverlayPath();
  if (!fs12.existsSync(filePath))
    return false;
  fs12.rmSync(filePath, { force: true });
  return true;
}
function describeHostedOverlayPath() {
  return path12.resolve(resolveHostedOverlayPath());
}
function seedHostedOverlayFromSession(input) {
  return {
    version: 1,
    hostedBaseUrl: input.hostedBaseUrl,
    userId: input.userId,
    email: input.email,
    displayName: input.email,
    orgId: input.orgId,
    orgName: input.orgName,
    entitlements: [],
    gatedKitSlugs: [],
    executionDefaults: defaultExecutionPreferences(),
    linkedInstanceId: input.linkedInstanceId,
    lastPulledAt: void 0,
    lastPushedAt: void 0,
    extra: input.machineLabel ? { machineLabel: input.machineLabel } : void 0
  };
}

// src/auth/effective-profile.ts
init_store();
init_home();
import fs13 from "node:fs";
import path13 from "node:path";
function toLocalWorkspaceView(configPath, config) {
  return {
    instanceId: resolvePaperclipInstanceId(),
    configPath,
    surfaceProfile: config?.surface?.profile === "dx" || config?.surface?.profile === "gtm" ? config.surface.profile : null,
    serverPort: typeof config?.server?.port === "number" ? config.server.port : null,
    serverHost: typeof config?.server?.host === "string" ? config.server.host : null,
    hasConfiguredToken: Boolean(config?.auth?.token?.trim()),
    growthubBaseUrl: config?.auth?.growthubBaseUrl?.trim() || null,
    growthubPortalBaseUrl: config?.auth?.growthubPortalBaseUrl?.trim() || null,
    machineLabel: config?.auth?.growthubMachineLabel?.trim() || null,
    workspaceLabel: config?.auth?.growthubWorkspaceLabel?.trim() || null
  };
}
function toHostedOverlayView(overlay) {
  if (!overlay) {
    return {
      present: false,
      hostedBaseUrl: null,
      userId: null,
      email: null,
      displayName: null,
      orgId: null,
      orgName: null,
      entitlements: [],
      gatedKitSlugs: [],
      executionDefaults: {
        preferredMode: "local",
        allowServerlessFallback: false,
        allowBrowserBridge: false
      },
      linkedInstanceId: null,
      lastPulledAt: null,
      lastPushedAt: null
    };
  }
  return {
    present: true,
    hostedBaseUrl: overlay.hostedBaseUrl || null,
    userId: overlay.userId ?? null,
    email: overlay.email ?? null,
    displayName: overlay.displayName ?? null,
    orgId: overlay.orgId ?? null,
    orgName: overlay.orgName ?? null,
    entitlements: overlay.entitlements,
    gatedKitSlugs: overlay.gatedKitSlugs,
    executionDefaults: overlay.executionDefaults,
    linkedInstanceId: overlay.linkedInstanceId ?? null,
    lastPulledAt: overlay.lastPulledAt ?? null,
    lastPushedAt: overlay.lastPushedAt ?? null
  };
}
function toSessionView(session, now) {
  if (!session) {
    return {
      present: false,
      expired: false,
      expiresAt: null,
      userId: null,
      hostedBaseUrl: null
    };
  }
  let expired = false;
  if (session.expiresAt) {
    const expires = Date.parse(session.expiresAt);
    if (!Number.isNaN(expires)) {
      expired = expires <= now.getTime();
    }
  }
  return {
    present: true,
    expired,
    expiresAt: session.expiresAt ?? null,
    userId: session.userId ?? null,
    hostedBaseUrl: session.hostedBaseUrl
  };
}
function computeEffectiveProfile(opts = {}) {
  const configPath = resolveConfigPath(opts.configPath);
  let config = null;
  try {
    config = readConfig(opts.configPath);
  } catch {
    config = null;
  }
  const overlay = readHostedOverlay();
  const session = readSession();
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const sessionView = toSessionView(session, now);
  const hostedView = toHostedOverlayView(overlay);
  const localView = toLocalWorkspaceView(configPath, config);
  return {
    version: 1,
    generatedAt: now.toISOString(),
    authenticated: sessionView.present && !sessionView.expired,
    local: localView,
    hosted: hostedView,
    session: sessionView,
    executionDefaults: hostedView.present ? hostedView.executionDefaults : {
      preferredMode: "local",
      allowServerlessFallback: false,
      allowBrowserBridge: false
    }
  };
}
function writeEffectiveProfileSnapshot(profile) {
  const filePath = resolveEffectiveProfilePath();
  fs13.mkdirSync(resolveProfilesDir(), { recursive: true });
  fs13.writeFileSync(filePath, `${JSON.stringify(profile, null, 2)}
`, { mode: 384 });
  return path13.resolve(filePath);
}

// src/commands/auth-login.ts
init_home();

// src/auth/hosted-client.ts
var DEFAULT_PULL_PATH = "/api/cli/profile";
var DEFAULT_PUSH_PATH = "/api/cli/profile";
var DEFAULT_SESSION_PATH = "/api/cli/session";
var DEFAULT_WORKFLOWS_PATH = "/api/cli/profile?view=workflows";
var DEFAULT_WORKFLOW_DETAIL_PATH = "/api/cli/profile?view=workflow";
var DEFAULT_WORKFLOW_SAVE_PATH = "/api/cli/profile?action=save-workflow";
var DEFAULT_WORKFLOW_ARCHIVE_PATH = "/api/cli/profile?action=archive-workflow";
var DEFAULT_WORKFLOW_DELETE_PATH = "/api/cli/profile?action=delete-workflow";
var DEFAULT_CREDITS_PATH = "/api/cli/profile?view=credits";
function toApiClient(session) {
  return new PaperclipApiClient({
    apiBase: session.hostedBaseUrl,
    apiKey: session.accessToken
  });
}
var HostedEndpointUnavailableError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
async function fetchHostedSession(session) {
  const client = toApiClient(session);
  try {
    return await client.get(DEFAULT_SESSION_PATH, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
async function fetchHostedProfile(session) {
  const client = toApiClient(session);
  try {
    return await client.get(DEFAULT_PULL_PATH, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
async function pushHostedProfile(session, payload) {
  const client = toApiClient(session);
  try {
    return await client.post(DEFAULT_PUSH_PATH, payload, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
async function listHostedWorkflows(session) {
  const client = toApiClient(session);
  try {
    return await client.get(DEFAULT_WORKFLOWS_PATH, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
async function fetchHostedWorkflow(session, workflowId) {
  const client = toApiClient(session);
  try {
    return await client.get(
      `${DEFAULT_WORKFLOW_DETAIL_PATH}&workflowId=${encodeURIComponent(workflowId)}`,
      { ignoreNotFound: true }
    );
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
async function saveHostedWorkflow(session, payload) {
  const client = toApiClient(session);
  try {
    return await client.post(DEFAULT_WORKFLOW_SAVE_PATH, payload, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
async function archiveHostedWorkflow(session, payload) {
  const client = toApiClient(session);
  try {
    return await client.post(DEFAULT_WORKFLOW_ARCHIVE_PATH, payload, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
async function deleteHostedWorkflow(session, payload) {
  const client = toApiClient(session);
  try {
    return await client.post(DEFAULT_WORKFLOW_DELETE_PATH, payload, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}
async function fetchHostedCredits(session) {
  const client = toApiClient(session);
  try {
    return await client.get(DEFAULT_CREDITS_PATH, { ignoreNotFound: true });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(err.status, err.message);
    }
    throw err;
  }
}

// src/commands/auth-login.ts
var DEFAULT_HOSTED_BASE_URL = "https://www.growthub.ai";
function trimSlashes2(value) {
  return value.replace(/\/+$/, "");
}
function resolveHostedBaseUrl(opts) {
  const explicit = opts.baseUrl?.trim();
  if (explicit)
    return trimSlashes2(explicit);
  const envBase = process.env.GROWTHUB_BASE_URL?.trim();
  if (envBase)
    return trimSlashes2(envBase);
  try {
    const config = readConfig(opts.configPath);
    const configuredBase = config?.auth?.growthubBaseUrl?.trim();
    if (configuredBase)
      return trimSlashes2(configuredBase);
    const portalBase = config?.auth?.growthubPortalBaseUrl?.trim();
    if (portalBase)
      return trimSlashes2(portalBase);
  } catch {
  }
  return DEFAULT_HOSTED_BASE_URL;
}
async function authLogin(opts) {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);
  const hostedBaseUrl = resolveHostedBaseUrl({ baseUrl: opts.baseUrl, configPath: opts.config });
  const machineLabel = opts.machineLabel?.trim() || os3.hostname();
  const workspaceLabel = opts.workspaceLabel?.trim();
  const linkedInstanceId = resolvePaperclipInstanceId();
  const existingSession = readSession();
  if (!opts.token && existingSession && !isSessionExpired(existingSession)) {
    const sameBaseUrl = trimSlashes2(existingSession.hostedBaseUrl) === hostedBaseUrl;
    if (sameBaseUrl) {
      try {
        await fetchHostedSession(existingSession);
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                status: "ok",
                hostedBaseUrl,
                userId: existingSession.userId ?? null,
                email: existingSession.email ?? null,
                reusedSession: true
              },
              null,
              2
            )
          );
          return;
        }
        p14.log.success(
          `Already connected${existingSession.email ? ` as ${existingSession.email}` : ""}.`
        );
        if (existingSession.hostedBaseUrl) {
          p14.log.message(pc19.dim(`Hosted: ${existingSession.hostedBaseUrl}`));
        }
        return;
      } catch {
        clearSession();
      }
    }
  }
  if (opts.token) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    writeSession({
      version: 1,
      hostedBaseUrl,
      accessToken: opts.token.trim(),
      issuedAt: now,
      machineLabel
    });
    const existingOverlay = readHostedOverlay();
    const overlay = existingOverlay ?? seedHostedOverlayFromSession({
      hostedBaseUrl,
      machineLabel,
      linkedInstanceId
    });
    writeHostedOverlay({
      ...overlay,
      hostedBaseUrl,
      linkedInstanceId: overlay.linkedInstanceId ?? linkedInstanceId
    });
    const effective = computeEffectiveProfile({ configPath });
    writeEffectiveProfileSnapshot(effective);
    if (opts.json) {
      console.log(JSON.stringify({ status: "ok", hostedBaseUrl, mode: "token" }, null, 2));
    } else {
      p14.log.success("Saved hosted session from --token.");
      p14.log.message(pc19.dim(`Session: ${describeSessionPath()}`));
      p14.log.message(pc19.dim(`Overlay: ${describeHostedOverlayPath()}`));
    }
    return;
  }
  p14.intro(pc19.bgCyan(pc19.black(" growthub auth login ")));
  p14.log.message(pc19.dim(`Hosted app: ${hostedBaseUrl}`));
  const flow = await startLoginFlow({
    hostedBaseUrl,
    machineLabel,
    workspaceLabel,
    timeoutMs: opts.timeoutMs
  });
  if (!opts.noBrowser) {
    try {
      p14.log.message("Opening browser to complete sign-in\u2026");
      await open(flow.loginUrl);
    } catch (err) {
      p14.log.warn(`Could not launch browser automatically: ${err instanceof Error ? err.message : String(err)}`);
      p14.log.message(pc19.dim("Paste this URL into a browser:"));
      p14.log.message(pc19.cyan(flow.loginUrl));
    }
  } else {
    p14.log.message(pc19.dim("Paste this URL into a browser:"));
    p14.log.message(pc19.cyan(flow.loginUrl));
  }
  const spinner10 = p14.spinner();
  spinner10.start("Waiting for hosted app to complete the exchange\u2026");
  try {
    const result = await flow.waitForCallback();
    spinner10.stop("Received hosted session token.");
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    writeSession({
      version: 1,
      hostedBaseUrl: result.hostedBaseUrl,
      accessToken: result.token,
      expiresAt: result.expiresAt,
      userId: result.userId,
      email: result.email,
      orgId: result.orgId,
      orgName: result.orgName,
      machineLabel: result.machineLabel,
      issuedAt: nowIso
    });
    const existingOverlay = readHostedOverlay();
    const overlay = existingOverlay ? {
      ...existingOverlay,
      hostedBaseUrl: result.hostedBaseUrl,
      userId: result.userId ?? existingOverlay.userId,
      email: result.email ?? existingOverlay.email,
      displayName: result.email ?? existingOverlay.displayName,
      orgId: result.orgId ?? existingOverlay.orgId,
      orgName: result.orgName ?? existingOverlay.orgName,
      linkedInstanceId: existingOverlay.linkedInstanceId ?? linkedInstanceId
    } : seedHostedOverlayFromSession({
      hostedBaseUrl: result.hostedBaseUrl,
      userId: result.userId,
      email: result.email,
      orgId: result.orgId,
      orgName: result.orgName,
      machineLabel: result.machineLabel,
      linkedInstanceId
    });
    writeHostedOverlay(overlay);
    const effective = computeEffectiveProfile({ configPath });
    writeEffectiveProfileSnapshot(effective);
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            status: "ok",
            hostedBaseUrl: result.hostedBaseUrl,
            userId: result.userId ?? null,
            email: result.email ?? null,
            orgId: result.orgId ?? null
          },
          null,
          2
        )
      );
    } else {
      p14.log.success(`Signed in${result.email ? ` as ${result.email}` : ""}.`);
      p14.log.message(pc19.dim(`Session: ${describeSessionPath()}`));
    }
    p14.outro("Done");
  } catch (err) {
    spinner10.stop("Login failed.");
    p14.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    flow.close();
  }
}
async function authLogout(opts) {
  const sessionCleared = clearSession();
  const overlayCleared = opts.keepOverlay ? false : clearHostedOverlay();
  const effective = computeEffectiveProfile({ configPath: resolveConfigPath(opts.config) });
  writeEffectiveProfileSnapshot(effective);
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          status: "ok",
          sessionCleared,
          overlayCleared
        },
        null,
        2
      )
    );
    return;
  }
  if (!sessionCleared && !overlayCleared) {
    console.log(pc19.dim("No hosted session or overlay present. Local workspace profile is untouched."));
    return;
  }
  if (sessionCleared)
    console.log(pc19.green("Cleared hosted session."));
  if (overlayCleared)
    console.log(pc19.green("Cleared hosted overlay."));
  console.log(pc19.dim("Local workspace profile is untouched."));
}
async function authWhoami(opts) {
  const session = readSession();
  const overlay = readHostedOverlay();
  const effective = computeEffectiveProfile({ configPath: resolveConfigPath(opts.config) });
  const payload = {
    authenticated: effective.authenticated,
    hostedBaseUrl: session?.hostedBaseUrl ?? overlay?.hostedBaseUrl ?? null,
    userId: overlay?.userId ?? session?.userId ?? null,
    email: overlay?.email ?? session?.email ?? null,
    displayName: overlay?.displayName ?? null,
    orgId: overlay?.orgId ?? session?.orgId ?? null,
    orgName: overlay?.orgName ?? session?.orgName ?? null,
    entitlements: overlay?.entitlements ?? [],
    linkedInstanceId: overlay?.linkedInstanceId ?? null,
    session: {
      present: Boolean(session),
      expired: effective.session.expired,
      expiresAt: effective.session.expiresAt
    }
  };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (!payload.authenticated) {
    console.log(pc19.yellow("Not signed in."));
    if (effective.session.present && effective.session.expired) {
      console.log(pc19.dim("Hosted session exists but is expired. Run `growthub auth login` to refresh."));
    } else {
      console.log(pc19.dim("Run `growthub auth login` to connect this CLI to hosted Growthub."));
    }
    console.log(pc19.dim("Local workspace profile continues to work without authentication."));
    return;
  }
  console.log(pc19.bold(`Signed in${payload.email ? ` as ${payload.email}` : payload.userId ? ` as ${payload.userId}` : ""}.`));
  if (payload.hostedBaseUrl)
    console.log(pc19.dim(`Hosted: ${payload.hostedBaseUrl}`));
  if (payload.orgName || payload.orgId) {
    console.log(pc19.dim(`Org: ${payload.orgName ?? payload.orgId}`));
  }
  if (payload.linkedInstanceId) {
    console.log(pc19.dim(`Linked local instance: ${payload.linkedInstanceId}`));
  }
  if (payload.entitlements.length > 0) {
    console.log(pc19.dim(`Entitlements: ${payload.entitlements.join(", ")}`));
  }
  if (payload.session.expiresAt) {
    console.log(pc19.dim(`Session expires: ${payload.session.expiresAt}`));
  }
}

// src/commands/profile.ts
init_store();
init_env();
import pc20 from "picocolors";
init_home();
function printEffectiveProfileHuman(effective) {
  console.log(pc20.bold("Effective profile"));
  console.log(
    `  Authenticated: ${effective.authenticated ? pc20.green("yes") : pc20.yellow("no")}${effective.session.expired ? pc20.yellow(" (session expired)") : ""}`
  );
  console.log(pc20.bold("Local workspace (base layer)"));
  console.log(`  Instance: ${effective.local.instanceId}`);
  console.log(`  Config: ${pc20.dim(effective.local.configPath)}`);
  console.log(
    `  Surface: ${effective.local.surfaceProfile ?? pc20.dim("(unset)")}  Host: ${effective.local.serverHost ?? pc20.dim("(unset)")}  Port: ${effective.local.serverPort ?? pc20.dim("(unset)")}`
  );
  console.log(
    `  Local-linked hosted token: ${effective.local.hasConfiguredToken ? pc20.green("set") : pc20.dim("none")}`
  );
  if (effective.local.growthubBaseUrl) {
    console.log(`  Growthub base: ${effective.local.growthubBaseUrl}`);
  }
  console.log(pc20.bold("Hosted overlay"));
  if (!effective.hosted.present) {
    console.log(pc20.dim("  No hosted overlay present. Run `growthub auth login` to attach one."));
  } else {
    if (effective.hosted.email || effective.hosted.userId) {
      console.log(`  User: ${effective.hosted.email ?? effective.hosted.userId}`);
    }
    if (effective.hosted.orgName || effective.hosted.orgId) {
      console.log(`  Org: ${effective.hosted.orgName ?? effective.hosted.orgId}`);
    }
    if (effective.hosted.hostedBaseUrl)
      console.log(`  Hosted: ${effective.hosted.hostedBaseUrl}`);
    if (effective.hosted.linkedInstanceId) {
      console.log(`  Linked instance: ${effective.hosted.linkedInstanceId}`);
    }
    if (effective.hosted.entitlements.length > 0) {
      console.log(`  Entitlements: ${effective.hosted.entitlements.join(", ")}`);
    }
    if (effective.hosted.gatedKitSlugs.length > 0) {
      console.log(`  Gated kits: ${effective.hosted.gatedKitSlugs.join(", ")}`);
    }
    if (effective.hosted.lastPulledAt)
      console.log(pc20.dim(`  Last pulled: ${effective.hosted.lastPulledAt}`));
    if (effective.hosted.lastPushedAt)
      console.log(pc20.dim(`  Last pushed: ${effective.hosted.lastPushedAt}`));
  }
  console.log(pc20.bold("Execution defaults"));
  console.log(
    `  preferredMode=${effective.executionDefaults.preferredMode}  serverlessFallback=${effective.executionDefaults.allowServerlessFallback}  browserBridge=${effective.executionDefaults.allowBrowserBridge}`
  );
}
async function runProfileStatus(opts) {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);
  const effective = computeEffectiveProfile({ configPath });
  writeEffectiveProfileSnapshot(effective);
  if (opts.json) {
    console.log(JSON.stringify(effective, null, 2));
    return;
  }
  printEffectiveProfileHuman(effective);
}
function normalizeExecutionPrefs(value, fallback) {
  if (!value)
    return fallback;
  const preferredMode = value.preferredMode === "local" || value.preferredMode === "serverless" || value.preferredMode === "browser" || value.preferredMode === "auto" ? value.preferredMode : fallback.preferredMode;
  return {
    preferredMode,
    allowServerlessFallback: typeof value.allowServerlessFallback === "boolean" ? value.allowServerlessFallback : fallback.allowServerlessFallback,
    allowBrowserBridge: typeof value.allowBrowserBridge === "boolean" ? value.allowBrowserBridge : fallback.allowBrowserBridge
  };
}
async function runProfilePull(opts) {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);
  const session = readSession();
  if (!session) {
    console.error(pc20.red("No hosted session. Run `growthub auth login` first."));
    process.exit(1);
  }
  if (isSessionExpired(session)) {
    console.error(pc20.red("Hosted session is expired. Run `growthub auth login` to refresh."));
    process.exit(1);
  }
  const existingOverlay = readHostedOverlay() ?? seedHostedOverlayFromSession({
    hostedBaseUrl: session.hostedBaseUrl,
    userId: session.userId,
    email: session.email,
    orgId: session.orgId,
    orgName: session.orgName,
    machineLabel: session.machineLabel,
    linkedInstanceId: resolvePaperclipInstanceId()
  });
  let remote = null;
  let usedFallback = false;
  try {
    remote = await fetchHostedProfile(session);
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      usedFallback = true;
      if (!opts.json) {
        console.log(
          pc20.yellow(
            "Hosted profile endpoint not yet available \u2014 keeping current overlay. (This is expected while gh-app is still shipping its CLI API.)"
          )
        );
      }
    } else {
      throw err;
    }
  }
  const merged = {
    ...existingOverlay,
    hostedBaseUrl: session.hostedBaseUrl,
    userId: remote?.userId ?? existingOverlay.userId,
    email: remote?.email ?? existingOverlay.email,
    displayName: remote?.displayName ?? existingOverlay.displayName ?? existingOverlay.email,
    orgId: remote?.orgId ?? existingOverlay.orgId,
    orgName: remote?.orgName ?? existingOverlay.orgName,
    entitlements: remote?.entitlements ?? existingOverlay.entitlements,
    gatedKitSlugs: remote?.gatedKitSlugs ?? existingOverlay.gatedKitSlugs,
    executionDefaults: normalizeExecutionPrefs(remote?.executionDefaults, existingOverlay.executionDefaults),
    lastPulledAt: remote ? (/* @__PURE__ */ new Date()).toISOString() : existingOverlay.lastPulledAt,
    extra: remote?.extra ?? existingOverlay.extra
  };
  writeHostedOverlay(merged);
  const effective = computeEffectiveProfile({ configPath });
  writeEffectiveProfileSnapshot(effective);
  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", usedFallback, overlay: merged }, null, 2));
    return;
  }
  if (!usedFallback) {
    console.log(pc20.green("Hosted profile pulled and overlay updated."));
  }
  console.log(pc20.dim(`Entitlements: ${merged.entitlements.length === 0 ? "(none)" : merged.entitlements.join(", ")}`));
  console.log(pc20.dim(`Gated kits: ${merged.gatedKitSlugs.length === 0 ? "(none)" : merged.gatedKitSlugs.join(", ")}`));
}
async function runProfilePush(opts) {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);
  const session = readSession();
  if (!session) {
    console.error(pc20.red("No hosted session. Run `growthub auth login` first."));
    process.exit(1);
  }
  if (isSessionExpired(session)) {
    console.error(pc20.red("Hosted session is expired. Run `growthub auth login` to refresh."));
    process.exit(1);
  }
  const effective = computeEffectiveProfile({ configPath });
  let acknowledged = false;
  let usedFallback = false;
  try {
    await pushHostedProfile(session, {
      linkedInstanceId: effective.local.instanceId,
      surfaceProfile: effective.local.surfaceProfile,
      machineLabel: effective.local.machineLabel,
      workspaceLabel: effective.local.workspaceLabel
    });
    acknowledged = true;
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      usedFallback = true;
    } else {
      throw err;
    }
  }
  const existingOverlay = readHostedOverlay() ?? seedHostedOverlayFromSession({
    hostedBaseUrl: session.hostedBaseUrl,
    userId: session.userId,
    email: session.email,
    orgId: session.orgId,
    orgName: session.orgName,
    machineLabel: session.machineLabel,
    linkedInstanceId: effective.local.instanceId
  });
  const updatedOverlay = {
    ...existingOverlay,
    linkedInstanceId: existingOverlay.linkedInstanceId ?? effective.local.instanceId,
    lastPushedAt: acknowledged ? (/* @__PURE__ */ new Date()).toISOString() : existingOverlay.lastPushedAt
  };
  writeHostedOverlay(updatedOverlay);
  writeEffectiveProfileSnapshot(computeEffectiveProfile({ configPath }));
  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", acknowledged, usedFallback, overlay: updatedOverlay }, null, 2));
    return;
  }
  if (usedFallback) {
    console.log(
      pc20.yellow(
        "Hosted push endpoint not yet available \u2014 linkage recorded locally only. (This is expected while gh-app is still shipping its CLI API.)"
      )
    );
    return;
  }
  console.log(pc20.green("Hosted profile push acknowledged."));
  console.log(pc20.dim(`Linked instance: ${effective.local.instanceId}`));
}
async function runProfileCredits(opts) {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);
  const session = readSession();
  if (!session) {
    console.error(pc20.red("No hosted session. Run `growthub auth login` first."));
    process.exit(1);
  }
  if (isSessionExpired(session)) {
    console.error(pc20.red("Hosted session is expired. Run `growthub auth login` to refresh."));
    process.exit(1);
  }
  try {
    const credits = await fetchHostedCredits(session);
    if (!credits || typeof credits.totalAvailable !== "number") {
      console.error(pc20.red("Hosted credits endpoint returned no data."));
      process.exit(1);
    }
    if (opts.json) {
      console.log(JSON.stringify(credits, null, 2));
      return;
    }
    console.log(pc20.bold("Hosted credits"));
    console.log(`  Available: $${credits.totalAvailable.toFixed(2)}`);
    console.log(`  Used this period: $${credits.creditsUsedThisPeriod.toFixed(2)} / $${credits.creditsPerMonth.toFixed(2)}`);
    console.log(`  Plan: ${credits.planTier}`);
    console.log(`  Period: ${credits.currentPeriodStart} \u2192 ${credits.currentPeriodEnd}`);
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      console.error(pc20.red("Hosted credits endpoint is not available on this app version."));
      process.exit(1);
    }
    throw err;
  }
}
function registerProfileCommands(program2) {
  const profile = program2.command("profile").description("Inspect and sync the effective Growthub profile (local workspace + hosted overlay)");
  profile.command("status").description("Show the merged local + hosted profile the CLI will use at runtime").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)").option("--json", "Output raw JSON").action(async (opts) => {
    await runProfileStatus(opts);
  });
  profile.command("pull").description("Pull hosted Growthub profile metadata into the local overlay").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)").option("--json", "Output raw JSON").action(async (opts) => {
    await runProfilePull(opts);
  });
  profile.command("push").description("Push safe local profile metadata (workspace linkage, labels) upward").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)").option("--json", "Output raw JSON").action(async (opts) => {
    await runProfilePush(opts);
  });
  profile.command("credits").description("Show hosted credit balance for the authenticated Growthub user").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)").option("--json", "Output raw JSON").action(async (opts) => {
    await runProfileCredits(opts);
  });
}

// src/commands/db-backup.ts
init_src2();
init_home();
init_store();
init_banner();
import path14 from "node:path";
import * as p15 from "@clack/prompts";
import pc21 from "picocolors";
function resolveConnectionString(configPath) {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl)
    return { value: envUrl, source: "DATABASE_URL" };
  const config = readConfig(configPath);
  if (config?.database.mode === "postgres" && config.database.connectionString?.trim()) {
    return { value: config.database.connectionString.trim(), source: "config.database.connectionString" };
  }
  const port = config?.database.embeddedPostgresPort ?? 54329;
  return {
    value: `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`,
    source: `embedded-postgres@${port}`
  };
}
function normalizeRetentionDays(value, fallback) {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate < 1) {
    throw new Error(`Invalid retention days '${String(candidate)}'. Use a positive integer.`);
  }
  return candidate;
}
function resolveBackupDir(raw) {
  return path14.resolve(expandHomePrefix(raw.trim()));
}
async function dbBackupCommand(opts) {
  printPaperclipCliBanner();
  p15.intro(pc21.bgCyan(pc21.black(" paperclip db:backup ")));
  const configPath = resolveConfigPath(opts.config);
  const config = readConfig(opts.config);
  const connection = resolveConnectionString(opts.config);
  const defaultDir = resolveDefaultBackupDir(resolvePaperclipInstanceId());
  const configuredDir = opts.dir?.trim() || config?.database.backup.dir || defaultDir;
  const backupDir = resolveBackupDir(configuredDir);
  const retentionDays = normalizeRetentionDays(
    opts.retentionDays,
    config?.database.backup.retentionDays ?? 30
  );
  const filenamePrefix = opts.filenamePrefix?.trim() || "paperclip";
  p15.log.message(pc21.dim(`Config: ${configPath}`));
  p15.log.message(pc21.dim(`Connection source: ${connection.source}`));
  p15.log.message(pc21.dim(`Backup dir: ${backupDir}`));
  p15.log.message(pc21.dim(`Retention: ${retentionDays} day(s)`));
  const spinner10 = p15.spinner();
  spinner10.start("Creating database backup...");
  try {
    const result = await runDatabaseBackup({
      connectionString: connection.value,
      backupDir,
      retentionDays,
      filenamePrefix
    });
    spinner10.stop(`Backup saved: ${formatDatabaseBackupResult(result)}`);
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            backupFile: result.backupFile,
            sizeBytes: result.sizeBytes,
            prunedCount: result.prunedCount,
            backupDir,
            retentionDays,
            connectionSource: connection.source
          },
          null,
          2
        )
      );
    }
    p15.outro(pc21.green("Backup completed."));
  } catch (err) {
    spinner10.stop(pc21.red("Backup failed."));
    throw err;
  }
}

// src/commands/client/context.ts
import pc22 from "picocolors";
function registerContextCommands(program2) {
  const context = program2.command("context").description("Manage CLI client context profiles");
  context.command("show").description("Show current context and active profile").option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)").option("--context <path>", "Path to CLI context file").option("--profile <name>", "Profile to inspect").option("--json", "Output raw JSON").action((opts) => {
    const contextPath = resolveContextPath(opts.context);
    const store = readContext(opts.context);
    const resolved = resolveProfile(store, opts.profile);
    const payload = {
      contextPath,
      currentProfile: store.currentProfile,
      profileName: resolved.name,
      profile: resolved.profile,
      profiles: store.profiles
    };
    printOutput(payload, { json: opts.json });
  });
  context.command("list").description("List available context profiles").option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)").option("--context <path>", "Path to CLI context file").option("--json", "Output raw JSON").action((opts) => {
    const store = readContext(opts.context);
    const rows = Object.entries(store.profiles).map(([name, profile]) => ({
      name,
      current: name === store.currentProfile,
      apiBase: profile.apiBase ?? null,
      companyId: profile.companyId ?? null,
      apiKeyEnvVarName: profile.apiKeyEnvVarName ?? null
    }));
    printOutput(rows, { json: opts.json });
  });
  context.command("use").description("Set active context profile").argument("<profile>", "Profile name").option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)").option("--context <path>", "Path to CLI context file").action((profile, opts) => {
    setCurrentProfile(profile, opts.context);
    console.log(pc22.green(`Active profile set to '${profile}'.`));
  });
  context.command("set").description("Set values on a profile").option("-d, --data-dir <path>", "Growthub data directory root (isolates local instance state)").option("--context <path>", "Path to CLI context file").option("--profile <name>", "Profile name (default: current profile)").option("--api-base <url>", "Default API base URL").option("--company-id <id>", "Default company ID").option("--api-key-env-var-name <name>", "Env var containing API key (recommended)").option("--use", "Set this profile as active").option("--json", "Output raw JSON").action((opts) => {
    const existing = readContext(opts.context);
    const targetProfile = opts.profile?.trim() || existing.currentProfile || "default";
    upsertProfile(
      targetProfile,
      {
        apiBase: opts.apiBase,
        companyId: opts.companyId,
        apiKeyEnvVarName: opts.apiKeyEnvVarName
      },
      opts.context
    );
    if (opts.use) {
      setCurrentProfile(targetProfile, opts.context);
    }
    const updated = readContext(opts.context);
    const resolved = resolveProfile(updated, targetProfile);
    const payload = {
      contextPath: resolveContextPath(opts.context),
      currentProfile: updated.currentProfile,
      profileName: resolved.name,
      profile: resolved.profile
    };
    if (!opts.json) {
      console.log(pc22.green(`Updated profile '${targetProfile}'.`));
      if (opts.use) {
        console.log(pc22.green(`Set '${targetProfile}' as active profile.`));
      }
    }
    printOutput(payload, { json: opts.json });
  });
}

// src/commands/client/company.ts
import { mkdir, readFile as readFile3, stat, writeFile as writeFile2 } from "node:fs/promises";
import path15 from "node:path";
function isUuidLike2(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function normalizeSelector(input) {
  return input.trim();
}
function parseInclude(input) {
  if (!input || !input.trim())
    return { company: true, agents: true };
  const values = input.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  const include = {
    company: values.includes("company"),
    agents: values.includes("agents")
  };
  if (!include.company && !include.agents) {
    throw new Error("Invalid --include value. Use one or both of: company,agents");
  }
  return include;
}
function parseAgents(input) {
  if (!input || !input.trim())
    return "all";
  const normalized = input.trim().toLowerCase();
  if (normalized === "all")
    return "all";
  const values = input.split(",").map((part) => part.trim()).filter(Boolean);
  if (values.length === 0)
    return "all";
  return Array.from(new Set(values));
}
function isHttpUrl(input) {
  return /^https?:\/\//i.test(input.trim());
}
function isGithubUrl(input) {
  return /^https?:\/\/github\.com\//i.test(input.trim());
}
async function resolveInlineSourceFromPath(inputPath) {
  const resolved = path15.resolve(inputPath);
  const resolvedStat = await stat(resolved);
  const manifestPath = resolvedStat.isDirectory() ? path15.join(resolved, "paperclip.manifest.json") : resolved;
  const manifestBaseDir = path15.dirname(manifestPath);
  const manifestRaw = await readFile3(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const files = {};
  if (manifest.company?.path) {
    const companyPath = manifest.company.path.replace(/\\/g, "/");
    files[companyPath] = await readFile3(path15.join(manifestBaseDir, companyPath), "utf8");
  }
  for (const agent of manifest.agents ?? []) {
    const agentPath = agent.path.replace(/\\/g, "/");
    files[agentPath] = await readFile3(path15.join(manifestBaseDir, agentPath), "utf8");
  }
  return { manifest, files };
}
async function writeExportToFolder(outDir, exported) {
  const root = path15.resolve(outDir);
  await mkdir(root, { recursive: true });
  const manifestPath = path15.join(root, "paperclip.manifest.json");
  await writeFile2(manifestPath, JSON.stringify(exported.manifest, null, 2), "utf8");
  for (const [relativePath, content] of Object.entries(exported.files)) {
    const normalized = relativePath.replace(/\\/g, "/");
    const filePath = path15.join(root, normalized);
    await mkdir(path15.dirname(filePath), { recursive: true });
    await writeFile2(filePath, content, "utf8");
  }
}
function matchesPrefix(company, selector) {
  return company.issuePrefix.toUpperCase() === selector.toUpperCase();
}
function resolveCompanyForDeletion(companies2, selectorRaw, by = "auto") {
  const selector = normalizeSelector(selectorRaw);
  if (!selector) {
    throw new Error("Company selector is required.");
  }
  const idMatch = companies2.find((company) => company.id === selector);
  const prefixMatch = companies2.find((company) => matchesPrefix(company, selector));
  if (by === "id") {
    if (!idMatch) {
      throw new Error(`No company found by ID '${selector}'.`);
    }
    return idMatch;
  }
  if (by === "prefix") {
    if (!prefixMatch) {
      throw new Error(`No company found by shortname/prefix '${selector}'.`);
    }
    return prefixMatch;
  }
  if (idMatch && prefixMatch && idMatch.id !== prefixMatch.id) {
    throw new Error(
      `Selector '${selector}' is ambiguous (matches both an ID and a shortname). Re-run with --by id or --by prefix.`
    );
  }
  if (idMatch)
    return idMatch;
  if (prefixMatch)
    return prefixMatch;
  throw new Error(
    `No company found for selector '${selector}'. Use company ID or issue prefix (for example PAP).`
  );
}
function assertDeleteConfirmation(company, opts) {
  if (!opts.yes) {
    throw new Error("Deletion requires --yes.");
  }
  const confirm13 = opts.confirm?.trim();
  if (!confirm13) {
    throw new Error(
      "Deletion requires --confirm <value> where value matches the company ID or issue prefix."
    );
  }
  const confirmsById = confirm13 === company.id;
  const confirmsByPrefix = confirm13.toUpperCase() === company.issuePrefix.toUpperCase();
  if (!confirmsById && !confirmsByPrefix) {
    throw new Error(
      `Confirmation '${confirm13}' does not match target company. Expected ID '${company.id}' or prefix '${company.issuePrefix}'.`
    );
  }
}
function assertDeleteFlags(opts) {
  if (!opts.yes) {
    throw new Error("Deletion requires --yes.");
  }
  if (!opts.confirm?.trim()) {
    throw new Error(
      "Deletion requires --confirm <value> where value matches the company ID or issue prefix."
    );
  }
}
function registerCompanyCommands(program2) {
  const company = program2.command("company").description("Company operations");
  addCommonClientOptions(
    company.command("list").description("List companies").action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const rows = await ctx.api.get("/api/companies") ?? [];
        if (ctx.json) {
          printOutput(rows, { json: true });
          return;
        }
        if (rows.length === 0) {
          printOutput([], { json: false });
          return;
        }
        const formatted = rows.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          budgetMonthlyCents: row.budgetMonthlyCents,
          spentMonthlyCents: row.spentMonthlyCents,
          requireBoardApprovalForNewAgents: row.requireBoardApprovalForNewAgents
        }));
        for (const row of formatted) {
          console.log(formatInlineRecord(row));
        }
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    company.command("get").description("Get one company").argument("<companyId>", "Company ID").action(async (companyId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const row = await ctx.api.get(`/api/companies/${companyId}`);
        printOutput(row, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    company.command("export").description("Export a company into portable manifest + markdown files").argument("<companyId>", "Company ID").requiredOption("--out <path>", "Output directory").option("--include <values>", "Comma-separated include set: company,agents", "company,agents").action(async (companyId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const include = parseInclude(opts.include);
        const exported = await ctx.api.post(
          `/api/companies/${companyId}/export`,
          { include }
        );
        if (!exported) {
          throw new Error("Export request returned no data");
        }
        await writeExportToFolder(opts.out, exported);
        printOutput(
          {
            ok: true,
            out: path15.resolve(opts.out),
            filesWritten: Object.keys(exported.files).length + 1,
            warningCount: exported.warnings.length
          },
          { json: ctx.json }
        );
        if (!ctx.json && exported.warnings.length > 0) {
          for (const warning of exported.warnings) {
            console.log(`warning=${warning}`);
          }
        }
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    company.command("import").description("Import a portable company package from local path, URL, or GitHub").requiredOption("--from <pathOrUrl>", "Source path or URL").option("--include <values>", "Comma-separated include set: company,agents", "company,agents").option("--target <mode>", "Target mode: new | existing").option("-C, --company-id <id>", "Existing target company ID").option("--new-company-name <name>", "Name override for --target new").option("--agents <list>", "Comma-separated agent slugs to import, or all", "all").option("--collision <mode>", "Collision strategy: rename | skip | replace", "rename").option("--dry-run", "Run preview only without applying", false).action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const from = (opts.from ?? "").trim();
        if (!from) {
          throw new Error("--from is required");
        }
        const include = parseInclude(opts.include);
        const agents2 = parseAgents(opts.agents);
        const collision = (opts.collision ?? "rename").toLowerCase();
        if (!["rename", "skip", "replace"].includes(collision)) {
          throw new Error("Invalid --collision value. Use: rename, skip, replace");
        }
        const inferredTarget = opts.target ?? (opts.companyId || ctx.companyId ? "existing" : "new");
        const target = inferredTarget.toLowerCase();
        if (!["new", "existing"].includes(target)) {
          throw new Error("Invalid --target value. Use: new | existing");
        }
        const existingTargetCompanyId = opts.companyId?.trim() || ctx.companyId;
        const targetPayload = target === "existing" ? {
          mode: "existing_company",
          companyId: existingTargetCompanyId
        } : {
          mode: "new_company",
          newCompanyName: opts.newCompanyName?.trim() || null
        };
        if (targetPayload.mode === "existing_company" && !targetPayload.companyId) {
          throw new Error("Target existing company requires --company-id (or context default companyId).");
        }
        let sourcePayload;
        if (isHttpUrl(from)) {
          sourcePayload = isGithubUrl(from) ? { type: "github", url: from } : { type: "url", url: from };
        } else {
          const inline = await resolveInlineSourceFromPath(from);
          sourcePayload = {
            type: "inline",
            manifest: inline.manifest,
            files: inline.files
          };
        }
        const payload = {
          source: sourcePayload,
          include,
          target: targetPayload,
          agents: agents2,
          collisionStrategy: collision
        };
        if (opts.dryRun) {
          const preview = await ctx.api.post(
            "/api/companies/import/preview",
            payload
          );
          printOutput(preview, { json: ctx.json });
          return;
        }
        const imported = await ctx.api.post("/api/companies/import", payload);
        printOutput(imported, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    company.command("delete").description("Delete a company by ID or shortname/prefix (destructive)").argument("<selector>", "Company ID or issue prefix (for example PAP)").option(
      "--by <mode>",
      "Selector mode: auto | id | prefix",
      "auto"
    ).option("--yes", "Required safety flag to confirm destructive action", false).option(
      "--confirm <value>",
      "Required safety value: target company ID or shortname/prefix"
    ).action(async (selector, opts) => {
      try {
        const by = (opts.by ?? "auto").trim().toLowerCase();
        if (!["auto", "id", "prefix"].includes(by)) {
          throw new Error(`Invalid --by mode '${opts.by}'. Expected one of: auto, id, prefix.`);
        }
        const ctx = resolveCommandContext(opts);
        const normalizedSelector = normalizeSelector(selector);
        assertDeleteFlags(opts);
        let target = null;
        const shouldTryIdLookup = by === "id" || by === "auto" && isUuidLike2(normalizedSelector);
        if (shouldTryIdLookup) {
          const byId = await ctx.api.get(`/api/companies/${normalizedSelector}`, { ignoreNotFound: true });
          if (byId) {
            target = byId;
          } else if (by === "id") {
            throw new Error(`No company found by ID '${normalizedSelector}'.`);
          }
        }
        if (!target && ctx.companyId) {
          const scoped = await ctx.api.get(`/api/companies/${ctx.companyId}`, { ignoreNotFound: true });
          if (scoped) {
            try {
              target = resolveCompanyForDeletion([scoped], normalizedSelector, by);
            } catch {
            }
          }
        }
        if (!target) {
          try {
            const companies2 = await ctx.api.get("/api/companies") ?? [];
            target = resolveCompanyForDeletion(companies2, normalizedSelector, by);
          } catch (error) {
            if (error instanceof ApiRequestError && error.status === 403 && error.message.includes("Board access required")) {
              throw new Error(
                "Board access is required to resolve companies across the instance. Use a company ID/prefix for your current company, or run with board authentication."
              );
            }
            throw error;
          }
        }
        if (!target) {
          throw new Error(`No company found for selector '${normalizedSelector}'.`);
        }
        assertDeleteConfirmation(target, opts);
        await ctx.api.delete(`/api/companies/${target.id}`);
        printOutput(
          {
            ok: true,
            deletedCompanyId: target.id,
            deletedCompanyName: target.name,
            deletedCompanyPrefix: target.issuePrefix
          },
          { json: ctx.json }
        );
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
}

// src/commands/client/issue.ts
init_src();
function registerIssueCommands(program2) {
  const issue = program2.command("issue").description("Issue operations");
  addCommonClientOptions(
    issue.command("list").description("List issues for a company").option("-C, --company-id <id>", "Company ID").option("--status <csv>", "Comma-separated statuses").option("--assignee-agent-id <id>", "Filter by assignee agent ID").option("--project-id <id>", "Filter by project ID").option("--match <text>", "Local text match on identifier/title/description").action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        const params = new URLSearchParams();
        if (opts.status)
          params.set("status", opts.status);
        if (opts.assigneeAgentId)
          params.set("assigneeAgentId", opts.assigneeAgentId);
        if (opts.projectId)
          params.set("projectId", opts.projectId);
        const query = params.toString();
        const path36 = `/api/companies/${ctx.companyId}/issues${query ? `?${query}` : ""}`;
        const rows = await ctx.api.get(path36) ?? [];
        const filtered = filterIssueRows(rows, opts.match);
        if (ctx.json) {
          printOutput(filtered, { json: true });
          return;
        }
        if (filtered.length === 0) {
          printOutput([], { json: false });
          return;
        }
        for (const item of filtered) {
          console.log(
            formatInlineRecord({
              identifier: item.identifier,
              id: item.id,
              status: item.status,
              priority: item.priority,
              assigneeAgentId: item.assigneeAgentId,
              title: item.title,
              projectId: item.projectId
            })
          );
        }
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false }
  );
  addCommonClientOptions(
    issue.command("get").description("Get an issue by UUID or identifier (e.g. PC-12)").argument("<idOrIdentifier>", "Issue ID or identifier").action(async (idOrIdentifier, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const row = await ctx.api.get(`/api/issues/${idOrIdentifier}`);
        printOutput(row, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    issue.command("create").description("Create an issue").requiredOption("-C, --company-id <id>", "Company ID").requiredOption("--title <title>", "Issue title").option("--description <text>", "Issue description").option("--status <status>", "Issue status").option("--priority <priority>", "Issue priority").option("--assignee-agent-id <id>", "Assignee agent ID").option("--project-id <id>", "Project ID").option("--goal-id <id>", "Goal ID").option("--parent-id <id>", "Parent issue ID").option("--request-depth <n>", "Request depth integer").option("--billing-code <code>", "Billing code").action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        const payload = createIssueSchema.parse({
          title: opts.title,
          description: opts.description,
          status: opts.status,
          priority: opts.priority,
          assigneeAgentId: opts.assigneeAgentId,
          projectId: opts.projectId,
          goalId: opts.goalId,
          parentId: opts.parentId,
          requestDepth: parseOptionalInt(opts.requestDepth),
          billingCode: opts.billingCode
        });
        const created = await ctx.api.post(`/api/companies/${ctx.companyId}/issues`, payload);
        printOutput(created, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false }
  );
  addCommonClientOptions(
    issue.command("update").description("Update an issue").argument("<issueId>", "Issue ID").option("--title <title>", "Issue title").option("--description <text>", "Issue description").option("--status <status>", "Issue status").option("--priority <priority>", "Issue priority").option("--assignee-agent-id <id>", "Assignee agent ID").option("--project-id <id>", "Project ID").option("--goal-id <id>", "Goal ID").option("--parent-id <id>", "Parent issue ID").option("--request-depth <n>", "Request depth integer").option("--billing-code <code>", "Billing code").option("--comment <text>", "Optional comment to add with update").option("--hidden-at <iso8601|null>", "Set hiddenAt timestamp or literal 'null'").action(async (issueId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const payload = updateIssueSchema.parse({
          title: opts.title,
          description: opts.description,
          status: opts.status,
          priority: opts.priority,
          assigneeAgentId: opts.assigneeAgentId,
          projectId: opts.projectId,
          goalId: opts.goalId,
          parentId: opts.parentId,
          requestDepth: parseOptionalInt(opts.requestDepth),
          billingCode: opts.billingCode,
          comment: opts.comment,
          hiddenAt: parseHiddenAt(opts.hiddenAt)
        });
        const updated = await ctx.api.patch(`/api/issues/${issueId}`, payload);
        printOutput(updated, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    issue.command("comment").description("Add comment to issue").argument("<issueId>", "Issue ID").requiredOption("--body <text>", "Comment body").option("--reopen", "Reopen if issue is done/cancelled").action(async (issueId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const payload = addIssueCommentSchema.parse({
          body: opts.body,
          reopen: opts.reopen
        });
        const comment = await ctx.api.post(`/api/issues/${issueId}/comments`, payload);
        printOutput(comment, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    issue.command("checkout").description("Checkout issue for an agent").argument("<issueId>", "Issue ID").requiredOption("--agent-id <id>", "Agent ID").option(
      "--expected-statuses <csv>",
      "Expected current statuses",
      "todo,backlog,blocked"
    ).action(async (issueId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const payload = checkoutIssueSchema.parse({
          agentId: opts.agentId,
          expectedStatuses: parseCsv(opts.expectedStatuses)
        });
        const updated = await ctx.api.post(`/api/issues/${issueId}/checkout`, payload);
        printOutput(updated, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    issue.command("release").description("Release issue back to todo and clear assignee").argument("<issueId>", "Issue ID").action(async (issueId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const updated = await ctx.api.post(`/api/issues/${issueId}/release`, {});
        printOutput(updated, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
}
function parseCsv(value) {
  if (!value)
    return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}
function parseOptionalInt(value) {
  if (value === void 0)
    return void 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return parsed;
}
function parseHiddenAt(value) {
  if (value === void 0)
    return void 0;
  if (value.trim().toLowerCase() === "null")
    return null;
  return value;
}
function filterIssueRows(rows, match) {
  if (!match?.trim())
    return rows;
  const needle = match.trim().toLowerCase();
  return rows.filter((row) => {
    const text63 = [row.identifier, row.title, row.description].filter((part) => Boolean(part)).join("\n").toLowerCase();
    return text63.includes(needle);
  });
}

// ../packages/adapter-utils/src/server-utils.ts
import { constants as fsConstants, promises as fs14 } from "node:fs";
import path16 from "node:path";
var MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
var MAX_EXCERPT_BYTES = 32 * 1024;
var PAPERCLIP_SKILL_ROOT_RELATIVE_CANDIDATES = [
  "../../skills",
  "../../../../../skills"
];
function normalizePathSlashes(value) {
  return value.replaceAll("\\", "/");
}
function isMaintainerOnlySkillTarget(candidate) {
  return normalizePathSlashes(candidate).includes("/.agents/skills/");
}
async function resolvePaperclipSkillsDir(moduleDir, additionalCandidates = []) {
  const candidates = [
    ...PAPERCLIP_SKILL_ROOT_RELATIVE_CANDIDATES.map((relativePath) => path16.resolve(moduleDir, relativePath)),
    ...additionalCandidates.map((candidate) => path16.resolve(candidate))
  ];
  const seenRoots = /* @__PURE__ */ new Set();
  for (const root of candidates) {
    if (seenRoots.has(root))
      continue;
    seenRoots.add(root);
    const isDirectory = await fs14.stat(root).then((stats) => stats.isDirectory()).catch(() => false);
    if (isDirectory)
      return root;
  }
  return null;
}
async function removeMaintainerOnlySkillSymlinks(skillsHome, allowedSkillNames) {
  const allowed = new Set(Array.from(allowedSkillNames));
  try {
    const entries = await fs14.readdir(skillsHome, { withFileTypes: true });
    const removed = [];
    for (const entry of entries) {
      if (allowed.has(entry.name))
        continue;
      const target = path16.join(skillsHome, entry.name);
      const existing = await fs14.lstat(target).catch(() => null);
      if (!existing?.isSymbolicLink())
        continue;
      const linkedPath = await fs14.readlink(target).catch(() => null);
      if (!linkedPath)
        continue;
      const resolvedLinkedPath = path16.isAbsolute(linkedPath) ? linkedPath : path16.resolve(path16.dirname(target), linkedPath);
      if (!isMaintainerOnlySkillTarget(linkedPath) && !isMaintainerOnlySkillTarget(resolvedLinkedPath)) {
        continue;
      }
      await fs14.unlink(target);
      removed.push(entry.name);
    }
    return removed;
  } catch {
    return [];
  }
}

// src/commands/client/agent.ts
import fs15 from "node:fs/promises";
import os4 from "node:os";
import path17 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var __moduleDir = path17.dirname(fileURLToPath3(import.meta.url));
function codexSkillsHome() {
  const fromEnv = process.env.CODEX_HOME?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : path17.join(os4.homedir(), ".codex");
  return path17.join(base, "skills");
}
function claudeSkillsHome() {
  const fromEnv = process.env.CLAUDE_HOME?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : path17.join(os4.homedir(), ".claude");
  return path17.join(base, "skills");
}
async function installSkillsForTarget(sourceSkillsDir, targetSkillsDir, tool) {
  const summary = {
    tool,
    target: targetSkillsDir,
    linked: [],
    removed: [],
    skipped: [],
    failed: []
  };
  await fs15.mkdir(targetSkillsDir, { recursive: true });
  const entries = await fs15.readdir(sourceSkillsDir, { withFileTypes: true });
  summary.removed = await removeMaintainerOnlySkillSymlinks(
    targetSkillsDir,
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  );
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue;
    const source = path17.join(sourceSkillsDir, entry.name);
    const target = path17.join(targetSkillsDir, entry.name);
    const existing = await fs15.lstat(target).catch(() => null);
    if (existing) {
      if (existing.isSymbolicLink()) {
        let linkedPath = null;
        try {
          linkedPath = await fs15.readlink(target);
        } catch (err) {
          await fs15.unlink(target);
          try {
            await fs15.symlink(source, target);
            summary.linked.push(entry.name);
            continue;
          } catch (linkErr) {
            summary.failed.push({
              name: entry.name,
              error: err instanceof Error && linkErr instanceof Error ? `${err.message}; then ${linkErr.message}` : err instanceof Error ? err.message : `Failed to recover broken symlink: ${String(err)}`
            });
            continue;
          }
        }
        const resolvedLinkedPath = path17.isAbsolute(linkedPath) ? linkedPath : path17.resolve(path17.dirname(target), linkedPath);
        const linkedTargetExists = await fs15.stat(resolvedLinkedPath).then(() => true).catch(() => false);
        if (!linkedTargetExists) {
          await fs15.unlink(target);
        } else {
          summary.skipped.push(entry.name);
          continue;
        }
      } else {
        summary.skipped.push(entry.name);
        continue;
      }
    }
    try {
      await fs15.symlink(source, target);
      summary.linked.push(entry.name);
    } catch (err) {
      summary.failed.push({
        name: entry.name,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return summary;
}
function buildAgentEnvExports(input) {
  const escaped = (value) => value.replace(/'/g, `'"'"'`);
  return [
    `export PAPERCLIP_API_URL='${escaped(input.apiBase)}'`,
    `export PAPERCLIP_COMPANY_ID='${escaped(input.companyId)}'`,
    `export PAPERCLIP_AGENT_ID='${escaped(input.agentId)}'`,
    `export PAPERCLIP_API_KEY='${escaped(input.apiKey)}'`
  ].join("\n");
}
function registerAgentCommands(program2) {
  const agent = program2.command("agent").description("Agent operations");
  addCommonClientOptions(
    agent.command("list").description("List agents for a company").requiredOption("-C, --company-id <id>", "Company ID").action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        const rows = await ctx.api.get(`/api/companies/${ctx.companyId}/agents`) ?? [];
        if (ctx.json) {
          printOutput(rows, { json: true });
          return;
        }
        if (rows.length === 0) {
          printOutput([], { json: false });
          return;
        }
        for (const row of rows) {
          console.log(
            formatInlineRecord({
              id: row.id,
              name: row.name,
              role: row.role,
              status: row.status,
              reportsTo: row.reportsTo,
              budgetMonthlyCents: row.budgetMonthlyCents,
              spentMonthlyCents: row.spentMonthlyCents
            })
          );
        }
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false }
  );
  addCommonClientOptions(
    agent.command("get").description("Get one agent").argument("<agentId>", "Agent ID").action(async (agentId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const row = await ctx.api.get(`/api/agents/${agentId}`);
        printOutput(row, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    agent.command("local-cli").description(
      "Create an agent API key, install local Paperclip skills for Codex/Claude, and print shell exports"
    ).argument("<agentRef>", "Agent ID or shortname/url-key").requiredOption("-C, --company-id <id>", "Company ID").option("--key-name <name>", "API key label", "local-cli").option(
      "--no-install-skills",
      "Skip installing Paperclip skills into ~/.codex/skills and ~/.claude/skills"
    ).action(async (agentRef, opts) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        const query = new URLSearchParams({ companyId: ctx.companyId ?? "" });
        const agentRow = await ctx.api.get(
          `/api/agents/${encodeURIComponent(agentRef)}?${query.toString()}`
        );
        if (!agentRow) {
          throw new Error(`Agent not found: ${agentRef}`);
        }
        const now = (/* @__PURE__ */ new Date()).toISOString().replaceAll(":", "-");
        const keyName = opts.keyName?.trim() ? opts.keyName.trim() : `local-cli-${now}`;
        const key = await ctx.api.post(`/api/agents/${agentRow.id}/keys`, { name: keyName });
        if (!key) {
          throw new Error("Failed to create API key");
        }
        const installSummaries = [];
        if (opts.installSkills !== false) {
          const skillsDir = await resolvePaperclipSkillsDir(__moduleDir, [path17.resolve(process.cwd(), "skills")]);
          if (!skillsDir) {
            throw new Error(
              "Could not locate local Paperclip skills directory. Expected ./skills in the repo checkout."
            );
          }
          installSummaries.push(
            await installSkillsForTarget(skillsDir, codexSkillsHome(), "codex"),
            await installSkillsForTarget(skillsDir, claudeSkillsHome(), "claude")
          );
        }
        const exportsText = buildAgentEnvExports({
          apiBase: ctx.api.apiBase,
          companyId: agentRow.companyId,
          agentId: agentRow.id,
          apiKey: key.token
        });
        if (ctx.json) {
          printOutput(
            {
              agent: {
                id: agentRow.id,
                name: agentRow.name,
                urlKey: agentRow.urlKey,
                companyId: agentRow.companyId
              },
              key: {
                id: key.id,
                name: key.name,
                createdAt: key.createdAt,
                token: key.token
              },
              skills: installSummaries,
              exports: exportsText
            },
            { json: true }
          );
          return;
        }
        console.log(`Agent: ${agentRow.name} (${agentRow.id})`);
        console.log(`API key created: ${key.name} (${key.id})`);
        if (installSummaries.length > 0) {
          for (const summary of installSummaries) {
            console.log(
              `${summary.tool}: linked=${summary.linked.length} removed=${summary.removed.length} skipped=${summary.skipped.length} failed=${summary.failed.length} target=${summary.target}`
            );
            for (const failed of summary.failed) {
              console.log(`  failed ${failed.name}: ${failed.error}`);
            }
          }
        }
        console.log("");
        console.log("# Run this in your shell before launching codex/claude:");
        console.log(exportsText);
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false }
  );
}

// src/commands/client/approval.ts
init_src();
function registerApprovalCommands(program2) {
  const approval = program2.command("approval").description("Approval operations");
  addCommonClientOptions(
    approval.command("list").description("List approvals for a company").requiredOption("-C, --company-id <id>", "Company ID").option("--status <status>", "Status filter").action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        const params = new URLSearchParams();
        if (opts.status)
          params.set("status", opts.status);
        const query = params.toString();
        const rows = await ctx.api.get(
          `/api/companies/${ctx.companyId}/approvals${query ? `?${query}` : ""}`
        ) ?? [];
        if (ctx.json) {
          printOutput(rows, { json: true });
          return;
        }
        if (rows.length === 0) {
          printOutput([], { json: false });
          return;
        }
        for (const row of rows) {
          console.log(
            formatInlineRecord({
              id: row.id,
              type: row.type,
              status: row.status,
              requestedByAgentId: row.requestedByAgentId,
              requestedByUserId: row.requestedByUserId
            })
          );
        }
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false }
  );
  addCommonClientOptions(
    approval.command("get").description("Get one approval").argument("<approvalId>", "Approval ID").action(async (approvalId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const row = await ctx.api.get(`/api/approvals/${approvalId}`);
        printOutput(row, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    approval.command("create").description("Create an approval request").requiredOption("-C, --company-id <id>", "Company ID").requiredOption("--type <type>", "Approval type (hire_agent|approve_ceo_strategy)").requiredOption("--payload <json>", "Approval payload as JSON object").option("--requested-by-agent-id <id>", "Requesting agent ID").option("--issue-ids <csv>", "Comma-separated linked issue IDs").action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        const payloadJson = parseJsonObject(opts.payload, "payload");
        const payload = createApprovalSchema.parse({
          type: opts.type,
          payload: payloadJson,
          requestedByAgentId: opts.requestedByAgentId,
          issueIds: parseCsv2(opts.issueIds)
        });
        const created = await ctx.api.post(`/api/companies/${ctx.companyId}/approvals`, payload);
        printOutput(created, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false }
  );
  addCommonClientOptions(
    approval.command("approve").description("Approve an approval request").argument("<approvalId>", "Approval ID").option("--decision-note <text>", "Decision note").option("--decided-by-user-id <id>", "Decision actor user ID").action(async (approvalId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const payload = resolveApprovalSchema.parse({
          decisionNote: opts.decisionNote,
          decidedByUserId: opts.decidedByUserId
        });
        const updated = await ctx.api.post(`/api/approvals/${approvalId}/approve`, payload);
        printOutput(updated, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    approval.command("reject").description("Reject an approval request").argument("<approvalId>", "Approval ID").option("--decision-note <text>", "Decision note").option("--decided-by-user-id <id>", "Decision actor user ID").action(async (approvalId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const payload = resolveApprovalSchema.parse({
          decisionNote: opts.decisionNote,
          decidedByUserId: opts.decidedByUserId
        });
        const updated = await ctx.api.post(`/api/approvals/${approvalId}/reject`, payload);
        printOutput(updated, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    approval.command("request-revision").description("Request revision for an approval").argument("<approvalId>", "Approval ID").option("--decision-note <text>", "Decision note").option("--decided-by-user-id <id>", "Decision actor user ID").action(async (approvalId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const payload = requestApprovalRevisionSchema.parse({
          decisionNote: opts.decisionNote,
          decidedByUserId: opts.decidedByUserId
        });
        const updated = await ctx.api.post(`/api/approvals/${approvalId}/request-revision`, payload);
        printOutput(updated, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    approval.command("resubmit").description("Resubmit an approval (optionally with new payload)").argument("<approvalId>", "Approval ID").option("--payload <json>", "Payload JSON object").action(async (approvalId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const payload = resubmitApprovalSchema.parse({
          payload: opts.payload ? parseJsonObject(opts.payload, "payload") : void 0
        });
        const updated = await ctx.api.post(`/api/approvals/${approvalId}/resubmit`, payload);
        printOutput(updated, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    approval.command("comment").description("Add comment to an approval").argument("<approvalId>", "Approval ID").requiredOption("--body <text>", "Comment body").action(async (approvalId, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const created = await ctx.api.post(`/api/approvals/${approvalId}/comments`, {
          body: opts.body
        });
        printOutput(created, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
}
function parseCsv2(value) {
  if (!value)
    return void 0;
  const rows = value.split(",").map((v) => v.trim()).filter(Boolean);
  return rows.length > 0 ? rows : void 0;
}
function parseJsonObject(value, name) {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${name} must be a JSON object`);
    }
    return parsed;
  } catch (err) {
    throw new Error(`Invalid ${name} JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// src/commands/client/activity.ts
function registerActivityCommands(program2) {
  const activity = program2.command("activity").description("Activity log operations");
  addCommonClientOptions(
    activity.command("list").description("List company activity log entries").requiredOption("-C, --company-id <id>", "Company ID").option("--agent-id <id>", "Filter by agent ID").option("--entity-type <type>", "Filter by entity type").option("--entity-id <id>", "Filter by entity ID").action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        const params = new URLSearchParams();
        if (opts.agentId)
          params.set("agentId", opts.agentId);
        if (opts.entityType)
          params.set("entityType", opts.entityType);
        if (opts.entityId)
          params.set("entityId", opts.entityId);
        const query = params.toString();
        const path36 = `/api/companies/${ctx.companyId}/activity${query ? `?${query}` : ""}`;
        const rows = await ctx.api.get(path36) ?? [];
        if (ctx.json) {
          printOutput(rows, { json: true });
          return;
        }
        if (rows.length === 0) {
          printOutput([], { json: false });
          return;
        }
        for (const row of rows) {
          console.log(
            formatInlineRecord({
              id: row.id,
              action: row.action,
              actorType: row.actorType,
              actorId: row.actorId,
              entityType: row.entityType,
              entityId: row.entityId,
              createdAt: String(row.createdAt)
            })
          );
        }
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false }
  );
}

// src/commands/client/dashboard.ts
function registerDashboardCommands(program2) {
  const dashboard = program2.command("dashboard").description("Dashboard summary operations");
  addCommonClientOptions(
    dashboard.command("get").description("Get dashboard summary for a company").requiredOption("-C, --company-id <id>", "Company ID").action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        const row = await ctx.api.get(`/api/companies/${ctx.companyId}/dashboard`);
        printOutput(row, { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false }
  );
}

// src/config/data-dir.ts
init_home();
import path18 from "node:path";
function applyDataDirOverride(options, support = {}) {
  const rawDataDir = options.dataDir?.trim();
  if (!rawDataDir)
    return null;
  const resolvedDataDir = path18.resolve(expandHomePrefix(rawDataDir));
  process.env.PAPERCLIP_HOME = resolvedDataDir;
  if (support.hasConfigOption) {
    const hasConfigOverride = Boolean(options.config?.trim()) || Boolean(process.env.PAPERCLIP_CONFIG?.trim());
    if (!hasConfigOverride) {
      const instanceId = resolvePaperclipInstanceId(options.instance);
      process.env.PAPERCLIP_INSTANCE_ID = instanceId;
      process.env.PAPERCLIP_CONFIG = resolveDefaultConfigPath(instanceId);
    }
  }
  if (support.hasContextOption) {
    const hasContextOverride = Boolean(options.context?.trim()) || Boolean(process.env.PAPERCLIP_CONTEXT?.trim());
    if (!hasContextOverride) {
      process.env.PAPERCLIP_CONTEXT = resolveDefaultContextPath();
    }
  }
  return resolvedDataDir;
}

// src/index.ts
init_env();
init_schema();
init_store();

// src/commands/gtm.ts
init_src();
init_home();
import fs16 from "node:fs";
import path19 from "node:path";
import { spawn } from "node:child_process";
import pc23 from "picocolors";
function resolveGtmStatePath() {
  return path19.resolve(resolvePaperclipHomeDir(), "gtm", "state.json");
}
function readState() {
  const filePath = resolveGtmStatePath();
  if (!fs16.existsSync(filePath))
    return createDefaultGtmState();
  return coerceGtmState(JSON.parse(fs16.readFileSync(filePath, "utf-8")));
}
function writeState(state) {
  const filePath = resolveGtmStatePath();
  fs16.mkdirSync(path19.dirname(filePath), { recursive: true });
  fs16.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
}
function launchWorkflow(state) {
  const runnerPath = state.workflow.runnerPath?.trim();
  if (!runnerPath) {
    throw new Error("No local SDR runner configured.");
  }
  if (!fs16.existsSync(runnerPath)) {
    throw new Error(`Runner not found at ${runnerPath}`);
  }
  const args = runnerPath.endsWith(".mjs") || runnerPath.endsWith(".js") ? [runnerPath] : [];
  const command = args.length > 0 ? process.execPath : runnerPath;
  const child = spawn(command, args, {
    cwd: path19.dirname(runnerPath),
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return {
    ...state,
    workflow: {
      ...state.workflow,
      lastRun: {
        command: [command, ...args].join(" "),
        error: null,
        finishedAt: null,
        pid: child.pid ?? null,
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        status: "running"
      }
    }
  };
}
function printJsonOrMessage(payload, json, message) {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (message)
    console.log(pc23.green(message));
  console.log(payload);
}
function registerGtmCommands(program2) {
  const gtm = program2.command("gtm").description("Growthub GTM substrate on the local machine");
  gtm.command("init").description("Initialize the local GTM substrate state").option("--account-email <email>", "Growthub account email").option("--workspace <name>", "Workspace label").option("--gh-app-path <path>", "Path to gh-app").option("--internal-socials-path <path>", "Reference UI path for internal-socials").option("--local-sdr-path <path>", "Reference/local runner path for growthub-sdr").option("--json", "Output raw JSON").action((opts) => {
    const state = createDefaultGtmState();
    if (opts.accountEmail)
      state.profile.growthubAccountEmail = opts.accountEmail.trim();
    if (opts.workspace)
      state.profile.workspaceName = opts.workspace.trim();
    if (opts.ghAppPath)
      state.profile.ghAppPath = opts.ghAppPath.trim();
    if (opts.internalSocialsPath)
      state.workflow.referenceInterfaces.internalSocialsPath = opts.internalSocialsPath.trim();
    if (opts.localSdrPath) {
      state.workflow.referenceInterfaces.localSdrPath = opts.localSdrPath.trim();
      state.workflow.runnerPath = path19.resolve(opts.localSdrPath.trim(), "sdr-bot.mjs");
    }
    writeState(state);
    const view = toGtmViewModel(state);
    printJsonOrMessage(view, opts.json, "Initialized local GTM substrate.");
  });
  gtm.command("profile").description("Show the active GTM profile").option("--json", "Output raw JSON").action((opts) => {
    const state = readState();
    const view = toGtmViewModel(state);
    printJsonOrMessage(view.profile, opts.json);
  });
  gtm.command("knowledge").description("Show knowledge table and item metadata").option("--json", "Output raw JSON").action((opts) => {
    const state = readState();
    const view = toGtmViewModel(state);
    printJsonOrMessage(view.knowledge, opts.json);
  });
  gtm.command("connectors").description("Show GTM connector metadata").option("--json", "Output raw JSON").action((opts) => {
    const state = readState();
    const view = toGtmViewModel(state);
    printJsonOrMessage(view.connectors, opts.json);
  });
  gtm.command("workflow").description("Show the single local GTM workflow").option("--run", "Launch the local SDR workflow").option("--json", "Output raw JSON").action((opts) => {
    let state = readState();
    if (opts.run) {
      state = launchWorkflow(state);
      writeState(state);
    }
    const view = toGtmViewModel(state);
    printJsonOrMessage(view.workflow, opts.json, opts.run ? "Launched local SDR workflow." : void 0);
  });
}

// src/commands/worktree.ts
init_src2();
init_env();
init_home();
init_store();
init_banner();
init_path_resolver();
import {
  chmodSync,
  copyFileSync,
  existsSync as existsSync2,
  mkdirSync as mkdirSync2,
  readdirSync as readdirSync2,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync as statSync2,
  symlinkSync,
  writeFileSync
} from "node:fs";
import os5 from "node:os";
import path21 from "node:path";
import { execFileSync } from "node:child_process";
import { createServer as createServer2 } from "node:net";
import * as p16 from "@clack/prompts";
import pc24 from "picocolors";
import { eq as eq2 } from "drizzle-orm";

// src/commands/worktree-lib.ts
init_home();
import { randomInt } from "node:crypto";
import path20 from "node:path";
var DEFAULT_WORKTREE_HOME = "~/.paperclip-worktrees";
var WORKTREE_SEED_MODES = ["minimal", "full"];
var MINIMAL_WORKTREE_EXCLUDED_TABLES = [
  "activity_log",
  "agent_runtime_state",
  "agent_task_sessions",
  "agent_wakeup_requests",
  "cost_events",
  "heartbeat_run_events",
  "heartbeat_runs",
  "workspace_runtime_services"
];
var MINIMAL_WORKTREE_NULLIFIED_COLUMNS = {
  issues: ["checkout_run_id", "execution_run_id"]
};
function isWorktreeSeedMode(value) {
  return WORKTREE_SEED_MODES.includes(value);
}
function resolveWorktreeSeedPlan(mode) {
  if (mode === "full") {
    return {
      mode,
      excludedTables: [],
      nullifyColumns: {}
    };
  }
  return {
    mode,
    excludedTables: [...MINIMAL_WORKTREE_EXCLUDED_TABLES],
    nullifyColumns: {
      ...MINIMAL_WORKTREE_NULLIFIED_COLUMNS
    }
  };
}
function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function isLoopbackHost2(hostname) {
  const value = hostname.trim().toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "::1";
}
function sanitizeWorktreeInstanceId(rawValue) {
  const trimmed = rawValue.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "");
  return normalized || "worktree";
}
function resolveSuggestedWorktreeName(cwd, explicitName) {
  return nonEmpty(explicitName) ?? path20.basename(path20.resolve(cwd));
}
function hslComponentToHex(n) {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
}
function hslToHex(hue, saturation, lightness) {
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const h = (hue % 360 + 360) % 360;
  const x = c * (1 - Math.abs(h / 60 % 2 - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return `#${hslComponentToHex((r + m) * 255)}${hslComponentToHex((g + m) * 255)}${hslComponentToHex((b + m) * 255)}`;
}
function generateWorktreeColor() {
  return hslToHex(randomInt(0, 360), 68, 56);
}
function resolveWorktreeLocalPaths(opts) {
  const cwd = path20.resolve(opts.cwd);
  const homeDir = path20.resolve(expandHomePrefix(opts.homeDir ?? DEFAULT_WORKTREE_HOME));
  const instanceRoot = path20.resolve(homeDir, "instances", opts.instanceId);
  const repoConfigDir = path20.resolve(cwd, ".paperclip");
  return {
    cwd,
    repoConfigDir,
    configPath: path20.resolve(repoConfigDir, "config.json"),
    envPath: path20.resolve(repoConfigDir, ".env"),
    homeDir,
    instanceId: opts.instanceId,
    instanceRoot,
    contextPath: path20.resolve(homeDir, "context.json"),
    embeddedPostgresDataDir: path20.resolve(instanceRoot, "db"),
    backupDir: path20.resolve(instanceRoot, "data", "backups"),
    logDir: path20.resolve(instanceRoot, "logs"),
    secretsKeyFilePath: path20.resolve(instanceRoot, "secrets", "master.key"),
    storageDir: path20.resolve(instanceRoot, "data", "storage")
  };
}
function rewriteLocalUrlPort(rawUrl, port) {
  if (!rawUrl)
    return void 0;
  try {
    const parsed = new URL(rawUrl);
    if (!isLoopbackHost2(parsed.hostname))
      return rawUrl;
    parsed.port = String(port);
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}
function buildWorktreeConfig(input) {
  const { sourceConfig, paths, serverPort, databasePort } = input;
  const nowIso = (input.now ?? /* @__PURE__ */ new Date()).toISOString();
  const source = sourceConfig;
  const authPublicBaseUrl = rewriteLocalUrlPort(source?.auth.publicBaseUrl, serverPort);
  return {
    $meta: {
      version: 1,
      updatedAt: nowIso,
      source: "configure"
    },
    ...source?.llm ? { llm: source.llm } : {},
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: paths.embeddedPostgresDataDir,
      embeddedPostgresPort: databasePort,
      backup: {
        enabled: source?.database.backup.enabled ?? true,
        intervalMinutes: source?.database.backup.intervalMinutes ?? 60,
        retentionDays: source?.database.backup.retentionDays ?? 30,
        dir: paths.backupDir
      }
    },
    logging: {
      mode: source?.logging.mode ?? "file",
      logDir: paths.logDir
    },
    server: {
      deploymentMode: source?.server.deploymentMode ?? "local_trusted",
      exposure: source?.server.exposure ?? "private",
      host: source?.server.host ?? "127.0.0.1",
      port: serverPort,
      allowedHostnames: source?.server.allowedHostnames ?? [],
      serveUi: source?.server.serveUi ?? true
    },
    auth: {
      baseUrlMode: source?.auth.baseUrlMode ?? "auto",
      ...authPublicBaseUrl ? { publicBaseUrl: authPublicBaseUrl } : {},
      disableSignUp: source?.auth.disableSignUp ?? false
    },
    surface: {
      profile: source?.surface.profile ?? "dx"
    },
    storage: {
      provider: source?.storage.provider ?? "local_disk",
      localDisk: {
        baseDir: paths.storageDir
      },
      s3: {
        bucket: source?.storage.s3.bucket ?? "paperclip",
        region: source?.storage.s3.region ?? "us-east-1",
        endpoint: source?.storage.s3.endpoint,
        prefix: source?.storage.s3.prefix ?? "",
        forcePathStyle: source?.storage.s3.forcePathStyle ?? false
      }
    },
    secrets: {
      provider: source?.secrets.provider ?? "local_encrypted",
      strictMode: source?.secrets.strictMode ?? false,
      localEncrypted: {
        keyFilePath: paths.secretsKeyFilePath
      }
    }
  };
}
function buildWorktreeEnvEntries(paths, branding) {
  return {
    PAPERCLIP_HOME: paths.homeDir,
    PAPERCLIP_INSTANCE_ID: paths.instanceId,
    PAPERCLIP_CONFIG: paths.configPath,
    PAPERCLIP_CONTEXT: paths.contextPath,
    PAPERCLIP_IN_WORKTREE: "true",
    ...branding?.name ? { PAPERCLIP_WORKTREE_NAME: branding.name } : {},
    ...branding?.color ? { PAPERCLIP_WORKTREE_COLOR: branding.color } : {}
  };
}
function shellEscape(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
function formatShellExports(entries) {
  return Object.entries(entries).filter(([, value]) => typeof value === "string" && value.trim().length > 0).map(([key, value]) => `export ${key}=${shellEscape(value)}`).join("\n");
}

// src/commands/worktree.ts
function nonEmpty2(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function isCurrentSourceConfigPath(sourceConfigPath) {
  const currentConfigPath = process.env.PAPERCLIP_CONFIG;
  if (!currentConfigPath || currentConfigPath.trim().length === 0) {
    return false;
  }
  return path21.resolve(currentConfigPath) === path21.resolve(sourceConfigPath);
}
var WORKTREE_NAME_PREFIX = "paperclip-";
function resolveWorktreeMakeName(name) {
  const value = nonEmpty2(name);
  if (!value) {
    throw new Error("Worktree name is required.");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(
      "Worktree name must contain only letters, numbers, dots, underscores, or dashes."
    );
  }
  return value.startsWith(WORKTREE_NAME_PREFIX) ? value : `${WORKTREE_NAME_PREFIX}${value}`;
}
function resolveWorktreeHome(explicit) {
  return explicit ?? process.env.PAPERCLIP_WORKTREES_DIR ?? DEFAULT_WORKTREE_HOME;
}
function resolveWorktreeStartPoint(explicit) {
  return explicit ?? nonEmpty2(process.env.PAPERCLIP_WORKTREE_START_POINT) ?? void 0;
}
function resolveWorktreeMakeTargetPath(name) {
  return path21.resolve(os5.homedir(), resolveWorktreeMakeName(name));
}
function extractExecSyncErrorMessage(error) {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : null;
  }
  const stderr = "stderr" in error ? error.stderr : null;
  if (typeof stderr === "string") {
    return nonEmpty2(stderr);
  }
  if (stderr instanceof Buffer) {
    return nonEmpty2(stderr.toString("utf8"));
  }
  return error instanceof Error ? nonEmpty2(error.message) : null;
}
function localBranchExists(cwd, branchName) {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
      cwd,
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}
function resolveGitWorktreeAddArgs(input) {
  if (input.branchExists && !input.startPoint) {
    return ["worktree", "add", input.targetPath, input.branchName];
  }
  const commitish = input.startPoint ?? "HEAD";
  return ["worktree", "add", "-b", input.branchName, input.targetPath, commitish];
}
function readPidFilePort(postmasterPidFile) {
  if (!existsSync2(postmasterPidFile))
    return null;
  try {
    const lines = readFileSync(postmasterPidFile, "utf8").split("\n");
    const port = Number(lines[3]?.trim());
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}
function readRunningPostmasterPid(postmasterPidFile) {
  if (!existsSync2(postmasterPidFile))
    return null;
  try {
    const pid = Number(readFileSync(postmasterPidFile, "utf8").split("\n")[0]?.trim());
    if (!Number.isInteger(pid) || pid <= 0)
      return null;
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}
async function isPortAvailable(port) {
  return await new Promise((resolve2) => {
    const server = createServer2();
    server.unref();
    server.once("error", () => resolve2(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve2(true));
    });
  });
}
async function findAvailablePort(preferredPort, reserved = /* @__PURE__ */ new Set()) {
  let port = Math.max(1, Math.trunc(preferredPort));
  while (reserved.has(port) || !await isPortAvailable(port)) {
    port += 1;
  }
  return port;
}
function detectGitBranchName(cwd) {
  try {
    const value = execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return nonEmpty2(value);
  } catch {
    return null;
  }
}
function detectGitWorkspaceInfo(cwd) {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const commonDirRaw = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const gitDirRaw = execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const hooksPathRaw = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return {
      root: path21.resolve(root),
      commonDir: path21.resolve(root, commonDirRaw),
      gitDir: path21.resolve(root, gitDirRaw),
      hooksPath: path21.resolve(root, hooksPathRaw)
    };
  } catch {
    return null;
  }
}
function copyDirectoryContents(sourceDir, targetDir) {
  if (!existsSync2(sourceDir))
    return false;
  const entries = readdirSync2(sourceDir, { withFileTypes: true });
  if (entries.length === 0)
    return false;
  mkdirSync2(targetDir, { recursive: true });
  let copied = false;
  for (const entry of entries) {
    const sourcePath = path21.resolve(sourceDir, entry.name);
    const targetPath = path21.resolve(targetDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync2(targetPath, { recursive: true });
      copyDirectoryContents(sourcePath, targetPath);
      copied = true;
      continue;
    }
    if (entry.isSymbolicLink()) {
      rmSync(targetPath, { recursive: true, force: true });
      symlinkSync(readlinkSync(sourcePath), targetPath);
      copied = true;
      continue;
    }
    copyFileSync(sourcePath, targetPath);
    try {
      chmodSync(targetPath, statSync2(sourcePath).mode & 511);
    } catch {
    }
    copied = true;
  }
  return copied;
}
function copyGitHooksToWorktreeGitDir(cwd) {
  const workspace = detectGitWorkspaceInfo(cwd);
  if (!workspace)
    return null;
  const sourceHooksPath = workspace.hooksPath;
  const targetHooksPath = path21.resolve(workspace.gitDir, "hooks");
  if (sourceHooksPath === targetHooksPath) {
    return {
      sourceHooksPath,
      targetHooksPath,
      copied: false
    };
  }
  return {
    sourceHooksPath,
    targetHooksPath,
    copied: copyDirectoryContents(sourceHooksPath, targetHooksPath)
  };
}
function rebindWorkspaceCwd(input) {
  const sourceRepoRoot = path21.resolve(input.sourceRepoRoot);
  const targetRepoRoot = path21.resolve(input.targetRepoRoot);
  const workspaceCwd = path21.resolve(input.workspaceCwd);
  const relative = path21.relative(sourceRepoRoot, workspaceCwd);
  if (!relative || relative === "") {
    return targetRepoRoot;
  }
  if (relative.startsWith("..") || path21.isAbsolute(relative)) {
    return null;
  }
  return path21.resolve(targetRepoRoot, relative);
}
async function rebindSeededProjectWorkspaces(input) {
  const targetRepo = detectGitWorkspaceInfo(input.currentCwd);
  if (!targetRepo)
    return [];
  const db = createDb(input.targetConnectionString);
  const closableDb = db;
  try {
    const rows = await db.select({
      id: projectWorkspaces.id,
      name: projectWorkspaces.name,
      cwd: projectWorkspaces.cwd
    }).from(projectWorkspaces);
    const rebound = [];
    for (const row of rows) {
      const workspaceCwd = nonEmpty2(row.cwd);
      if (!workspaceCwd)
        continue;
      const sourceRepo = detectGitWorkspaceInfo(workspaceCwd);
      if (!sourceRepo)
        continue;
      if (sourceRepo.commonDir !== targetRepo.commonDir)
        continue;
      const reboundCwd = rebindWorkspaceCwd({
        sourceRepoRoot: sourceRepo.root,
        targetRepoRoot: targetRepo.root,
        workspaceCwd
      });
      if (!reboundCwd)
        continue;
      const normalizedCurrent = path21.resolve(workspaceCwd);
      if (reboundCwd === normalizedCurrent)
        continue;
      if (!existsSync2(reboundCwd))
        continue;
      await db.update(projectWorkspaces).set({
        cwd: reboundCwd,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq2(projectWorkspaces.id, row.id));
      rebound.push({
        name: row.name,
        fromCwd: normalizedCurrent,
        toCwd: reboundCwd
      });
    }
    return rebound;
  } finally {
    await closableDb.$client?.end?.({ timeout: 5 }).catch(() => void 0);
  }
}
function resolveSourceConfigPath(opts) {
  if (opts.sourceConfigPathOverride)
    return path21.resolve(opts.sourceConfigPathOverride);
  if (opts.fromConfig)
    return path21.resolve(opts.fromConfig);
  if (!opts.fromDataDir && !opts.fromInstance) {
    return resolveConfigPath();
  }
  const sourceHome = path21.resolve(expandHomePrefix(opts.fromDataDir ?? "~/.paperclip"));
  const sourceInstanceId = sanitizeWorktreeInstanceId(opts.fromInstance ?? "default");
  return path21.resolve(sourceHome, "instances", sourceInstanceId, "config.json");
}
function resolveSourceConnectionString(config, envEntries, portOverride) {
  if (config.database.mode === "postgres") {
    const connectionString = nonEmpty2(envEntries.DATABASE_URL) ?? nonEmpty2(config.database.connectionString);
    if (!connectionString) {
      throw new Error(
        "Source instance uses postgres mode but has no connection string in config or adjacent .env."
      );
    }
    return connectionString;
  }
  const port = portOverride ?? config.database.embeddedPostgresPort;
  return `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
}
function copySeededSecretsKey(input) {
  if (input.sourceConfig.secrets.provider !== "local_encrypted") {
    return;
  }
  mkdirSync2(path21.dirname(input.targetKeyFilePath), { recursive: true });
  const allowProcessEnvFallback = isCurrentSourceConfigPath(input.sourceConfigPath);
  const sourceInlineMasterKey = nonEmpty2(input.sourceEnvEntries.PAPERCLIP_SECRETS_MASTER_KEY) ?? (allowProcessEnvFallback ? nonEmpty2(process.env.PAPERCLIP_SECRETS_MASTER_KEY) : null);
  if (sourceInlineMasterKey) {
    writeFileSync(input.targetKeyFilePath, sourceInlineMasterKey, {
      encoding: "utf8",
      mode: 384
    });
    try {
      chmodSync(input.targetKeyFilePath, 384);
    } catch {
    }
    return;
  }
  const sourceKeyFileOverride = nonEmpty2(input.sourceEnvEntries.PAPERCLIP_SECRETS_MASTER_KEY_FILE) ?? (allowProcessEnvFallback ? nonEmpty2(process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE) : null);
  const sourceConfiguredKeyPath = sourceKeyFileOverride ?? input.sourceConfig.secrets.localEncrypted.keyFilePath;
  const sourceKeyFilePath = resolveRuntimeLikePath(sourceConfiguredKeyPath, input.sourceConfigPath);
  if (!existsSync2(sourceKeyFilePath)) {
    throw new Error(
      `Cannot seed worktree database because source local_encrypted secrets key was not found at ${sourceKeyFilePath}.`
    );
  }
  copyFileSync(sourceKeyFilePath, input.targetKeyFilePath);
  try {
    chmodSync(input.targetKeyFilePath, 384);
  } catch {
  }
}
async function ensureEmbeddedPostgres(dataDir, preferredPort) {
  const moduleName = "embedded-postgres";
  let EmbeddedPostgres;
  try {
    const mod = await import(moduleName);
    EmbeddedPostgres = mod.default;
  } catch {
    throw new Error(
      "Embedded PostgreSQL support requires dependency `embedded-postgres`. Reinstall dependencies and try again."
    );
  }
  const postmasterPidFile = path21.resolve(dataDir, "postmaster.pid");
  const runningPid = readRunningPostmasterPid(postmasterPidFile);
  if (runningPid) {
    return {
      port: readPidFilePort(postmasterPidFile) ?? preferredPort,
      startedByThisProcess: false,
      stop: async () => {
      }
    };
  }
  const port = await findAvailablePort(preferredPort);
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "paperclip",
    password: "paperclip",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {
    },
    onError: () => {
    }
  });
  if (!existsSync2(path21.resolve(dataDir, "PG_VERSION"))) {
    await instance.initialise();
  }
  if (existsSync2(postmasterPidFile)) {
    rmSync(postmasterPidFile, { force: true });
  }
  await instance.start();
  return {
    port,
    startedByThisProcess: true,
    stop: async () => {
      await instance.stop();
    }
  };
}
async function seedWorktreeDatabase(input) {
  const seedPlan = resolveWorktreeSeedPlan(input.seedMode);
  const sourceEnvFile = resolvePaperclipEnvFile(input.sourceConfigPath);
  const sourceEnvEntries = readPaperclipEnvEntries(sourceEnvFile);
  copySeededSecretsKey({
    sourceConfigPath: input.sourceConfigPath,
    sourceConfig: input.sourceConfig,
    sourceEnvEntries,
    targetKeyFilePath: input.targetPaths.secretsKeyFilePath
  });
  let sourceHandle = null;
  let targetHandle = null;
  try {
    if (input.sourceConfig.database.mode === "embedded-postgres") {
      sourceHandle = await ensureEmbeddedPostgres(
        input.sourceConfig.database.embeddedPostgresDataDir,
        input.sourceConfig.database.embeddedPostgresPort
      );
    }
    const sourceConnectionString = resolveSourceConnectionString(
      input.sourceConfig,
      sourceEnvEntries,
      sourceHandle?.port
    );
    const backup = await runDatabaseBackup({
      connectionString: sourceConnectionString,
      backupDir: path21.resolve(input.targetPaths.backupDir, "seed"),
      retentionDays: 7,
      filenamePrefix: `${input.instanceId}-seed`,
      includeMigrationJournal: true,
      excludeTables: seedPlan.excludedTables,
      nullifyColumns: seedPlan.nullifyColumns
    });
    targetHandle = await ensureEmbeddedPostgres(
      input.targetConfig.database.embeddedPostgresDataDir,
      input.targetConfig.database.embeddedPostgresPort
    );
    const adminConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${targetHandle.port}/postgres`;
    await ensurePostgresDatabase(adminConnectionString, "paperclip");
    const targetConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${targetHandle.port}/paperclip`;
    await runDatabaseRestore({
      connectionString: targetConnectionString,
      backupFile: backup.backupFile
    });
    await applyPendingMigrations(targetConnectionString);
    const reboundWorkspaces = await rebindSeededProjectWorkspaces({
      targetConnectionString,
      currentCwd: input.targetPaths.cwd
    });
    return {
      backupSummary: formatDatabaseBackupResult(backup),
      reboundWorkspaces
    };
  } finally {
    if (targetHandle?.startedByThisProcess) {
      await targetHandle.stop();
    }
    if (sourceHandle?.startedByThisProcess) {
      await sourceHandle.stop();
    }
  }
}
async function runWorktreeInit(opts) {
  const cwd = process.cwd();
  const worktreeName = resolveSuggestedWorktreeName(
    cwd,
    opts.name ?? detectGitBranchName(cwd) ?? void 0
  );
  const seedMode = opts.seedMode ?? "minimal";
  if (!isWorktreeSeedMode(seedMode)) {
    throw new Error(`Unsupported seed mode "${seedMode}". Expected one of: minimal, full.`);
  }
  const instanceId = sanitizeWorktreeInstanceId(opts.instance ?? worktreeName);
  const paths = resolveWorktreeLocalPaths({
    cwd,
    homeDir: resolveWorktreeHome(opts.home),
    instanceId
  });
  const branding = {
    name: worktreeName,
    color: generateWorktreeColor()
  };
  const sourceConfigPath = resolveSourceConfigPath(opts);
  const sourceConfig = existsSync2(sourceConfigPath) ? readConfig(sourceConfigPath) : null;
  if ((existsSync2(paths.configPath) || existsSync2(paths.instanceRoot)) && !opts.force) {
    throw new Error(
      `Worktree config already exists at ${paths.configPath} or instance data exists at ${paths.instanceRoot}. Re-run with --force to replace it.`
    );
  }
  if (opts.force) {
    rmSync(paths.repoConfigDir, { recursive: true, force: true });
    rmSync(paths.instanceRoot, { recursive: true, force: true });
  }
  const preferredServerPort = opts.serverPort ?? (sourceConfig?.server.port ?? 3100) + 1;
  const serverPort = await findAvailablePort(preferredServerPort);
  const preferredDbPort = opts.dbPort ?? (sourceConfig?.database.embeddedPostgresPort ?? 54329) + 1;
  const databasePort = await findAvailablePort(preferredDbPort, /* @__PURE__ */ new Set([serverPort]));
  const targetConfig = buildWorktreeConfig({
    sourceConfig,
    paths,
    serverPort,
    databasePort
  });
  writeConfig(targetConfig, paths.configPath);
  const sourceEnvEntries = readPaperclipEnvEntries(resolvePaperclipEnvFile(sourceConfigPath));
  const existingAgentJwtSecret = nonEmpty2(sourceEnvEntries.PAPERCLIP_AGENT_JWT_SECRET) ?? nonEmpty2(process.env.PAPERCLIP_AGENT_JWT_SECRET);
  mergePaperclipEnvEntries(
    {
      ...buildWorktreeEnvEntries(paths, branding),
      ...existingAgentJwtSecret ? { PAPERCLIP_AGENT_JWT_SECRET: existingAgentJwtSecret } : {}
    },
    paths.envPath
  );
  ensureAgentJwtSecret(paths.configPath);
  loadPaperclipEnvFile(paths.configPath);
  const copiedGitHooks = copyGitHooksToWorktreeGitDir(cwd);
  let seedSummary = null;
  let reboundWorkspaceSummary = [];
  if (opts.seed !== false) {
    if (!sourceConfig) {
      throw new Error(
        `Cannot seed worktree database because source config was not found at ${sourceConfigPath}. Use --no-seed or provide --from-config.`
      );
    }
    const spinner10 = p16.spinner();
    spinner10.start(`Seeding isolated worktree database from source instance (${seedMode})...`);
    try {
      const seeded = await seedWorktreeDatabase({
        sourceConfigPath,
        sourceConfig,
        targetConfig,
        targetPaths: paths,
        instanceId,
        seedMode
      });
      seedSummary = seeded.backupSummary;
      reboundWorkspaceSummary = seeded.reboundWorkspaces;
      spinner10.stop(`Seeded isolated worktree database (${seedMode}).`);
    } catch (error) {
      spinner10.stop(pc24.red("Failed to seed worktree database."));
      throw error;
    }
  }
  p16.log.message(pc24.dim(`Repo config: ${paths.configPath}`));
  p16.log.message(pc24.dim(`Repo env: ${paths.envPath}`));
  p16.log.message(pc24.dim(`Isolated home: ${paths.homeDir}`));
  p16.log.message(pc24.dim(`Instance: ${paths.instanceId}`));
  p16.log.message(pc24.dim(`Worktree badge: ${branding.name} (${branding.color})`));
  p16.log.message(pc24.dim(`Server port: ${serverPort} | DB port: ${databasePort}`));
  if (copiedGitHooks?.copied) {
    p16.log.message(
      pc24.dim(`Mirrored git hooks: ${copiedGitHooks.sourceHooksPath} -> ${copiedGitHooks.targetHooksPath}`)
    );
  }
  if (seedSummary) {
    p16.log.message(pc24.dim(`Seed mode: ${seedMode}`));
    p16.log.message(pc24.dim(`Seed snapshot: ${seedSummary}`));
    for (const rebound of reboundWorkspaceSummary) {
      p16.log.message(
        pc24.dim(`Rebound workspace ${rebound.name}: ${rebound.fromCwd} -> ${rebound.toCwd}`)
      );
    }
  }
  p16.outro(
    pc24.green(
      `Worktree ready. Run Paperclip inside this repo and the CLI/server will use ${paths.instanceId} automatically.`
    )
  );
}
async function worktreeInitCommand(opts) {
  printPaperclipCliBanner();
  p16.intro(pc24.bgCyan(pc24.black(" paperclipai worktree init ")));
  await runWorktreeInit(opts);
}
async function worktreeMakeCommand(nameArg, opts) {
  printPaperclipCliBanner();
  p16.intro(pc24.bgCyan(pc24.black(" paperclipai worktree:make ")));
  const name = resolveWorktreeMakeName(nameArg);
  const startPoint = resolveWorktreeStartPoint(opts.startPoint);
  const sourceCwd = process.cwd();
  const sourceConfigPath = resolveSourceConfigPath(opts);
  const targetPath = resolveWorktreeMakeTargetPath(name);
  if (existsSync2(targetPath)) {
    throw new Error(`Target path already exists: ${targetPath}`);
  }
  mkdirSync2(path21.dirname(targetPath), { recursive: true });
  if (startPoint) {
    const [remote] = startPoint.split("/", 1);
    try {
      execFileSync("git", ["fetch", remote], {
        cwd: sourceCwd,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      throw new Error(
        `Failed to fetch from remote "${remote}": ${extractExecSyncErrorMessage(error) ?? String(error)}`
      );
    }
  }
  const worktreeArgs = resolveGitWorktreeAddArgs({
    branchName: name,
    targetPath,
    branchExists: !startPoint && localBranchExists(sourceCwd, name),
    startPoint
  });
  const spinner10 = p16.spinner();
  spinner10.start(`Creating git worktree at ${targetPath}...`);
  try {
    execFileSync("git", worktreeArgs, {
      cwd: sourceCwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    spinner10.stop(`Created git worktree at ${targetPath}.`);
  } catch (error) {
    spinner10.stop(pc24.red("Failed to create git worktree."));
    throw new Error(extractExecSyncErrorMessage(error) ?? String(error));
  }
  const installSpinner = p16.spinner();
  installSpinner.start("Installing dependencies...");
  try {
    execFileSync("pnpm", ["install"], {
      cwd: targetPath,
      stdio: ["ignore", "pipe", "pipe"]
    });
    installSpinner.stop("Installed dependencies.");
  } catch (error) {
    installSpinner.stop(pc24.yellow("Failed to install dependencies (continuing anyway)."));
    p16.log.warning(extractExecSyncErrorMessage(error) ?? String(error));
  }
  const originalCwd = process.cwd();
  try {
    process.chdir(targetPath);
    await runWorktreeInit({
      ...opts,
      name,
      sourceConfigPathOverride: sourceConfigPath
    });
  } catch (error) {
    throw error;
  } finally {
    process.chdir(originalCwd);
  }
  const bootstrapScript = path21.resolve(sourceCwd, "scripts/worktree-bootstrap.mjs");
  if (existsSync2(bootstrapScript)) {
    p16.log.message(pc24.dim(`Running worktree bootstrap in ${targetPath}...`));
    try {
      execFileSync("node", [bootstrapScript], { cwd: targetPath, stdio: "inherit" });
    } catch (error) {
      p16.log.warning(`Bootstrap failed: ${extractExecSyncErrorMessage(error) ?? String(error)}`);
    }
  }
}
function parseGitWorktreeList(cwd) {
  const raw = execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const entries = [];
  let current = {};
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { worktree: line.slice("worktree ".length) };
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "detached") {
      current.detached = true;
    } else if (line === "" && current.worktree) {
      entries.push({
        worktree: current.worktree,
        branch: current.branch ?? null,
        bare: current.bare ?? false,
        detached: current.detached ?? false
      });
      current = {};
    }
  }
  if (current.worktree) {
    entries.push({
      worktree: current.worktree,
      branch: current.branch ?? null,
      bare: current.bare ?? false,
      detached: current.detached ?? false
    });
  }
  return entries;
}
function branchHasUniqueCommits(cwd, branchName) {
  try {
    const output = execFileSync(
      "git",
      ["log", "--oneline", branchName, "--not", "--remotes", "--exclude", `refs/heads/${branchName}`, "--branches"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}
function branchExistsOnAnyRemote(cwd, branchName) {
  try {
    const output = execFileSync(
      "git",
      ["branch", "-r", "--list", `*/${branchName}`],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}
function worktreePathHasUncommittedChanges(worktreePath) {
  try {
    const output = execFileSync(
      "git",
      ["status", "--porcelain"],
      { cwd: worktreePath, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}
async function worktreeCleanupCommand(nameArg, opts) {
  printPaperclipCliBanner();
  p16.intro(pc24.bgCyan(pc24.black(" paperclipai worktree:cleanup ")));
  const name = resolveWorktreeMakeName(nameArg);
  const sourceCwd = process.cwd();
  const targetPath = resolveWorktreeMakeTargetPath(name);
  const instanceId = sanitizeWorktreeInstanceId(opts.instance ?? name);
  const homeDir = path21.resolve(expandHomePrefix(resolveWorktreeHome(opts.home)));
  const instanceRoot = path21.resolve(homeDir, "instances", instanceId);
  const hasBranch = localBranchExists(sourceCwd, name);
  const hasTargetDir = existsSync2(targetPath);
  const hasInstanceData = existsSync2(instanceRoot);
  const worktrees = parseGitWorktreeList(sourceCwd);
  const linkedWorktree = worktrees.find(
    (wt) => wt.branch === `refs/heads/${name}` || path21.resolve(wt.worktree) === path21.resolve(targetPath)
  );
  if (!hasBranch && !hasTargetDir && !hasInstanceData && !linkedWorktree) {
    p16.log.info("Nothing to clean up \u2014 no branch, worktree directory, or instance data found.");
    p16.outro(pc24.green("Already clean."));
    return;
  }
  const problems = [];
  if (hasBranch && branchHasUniqueCommits(sourceCwd, name)) {
    const onRemote = branchExistsOnAnyRemote(sourceCwd, name);
    if (onRemote) {
      p16.log.info(
        `Branch "${name}" has unique local commits, but the branch also exists on a remote \u2014 safe to delete locally.`
      );
    } else {
      problems.push(
        `Branch "${name}" has commits not found on any other branch or remote. Deleting it will lose work. Push it first, or use --force.`
      );
    }
  }
  if (hasTargetDir && worktreePathHasUncommittedChanges(targetPath)) {
    problems.push(
      `Worktree directory ${targetPath} has uncommitted changes. Commit or stash first, or use --force.`
    );
  }
  if (problems.length > 0 && !opts.force) {
    for (const problem of problems) {
      p16.log.error(problem);
    }
    throw new Error("Safety checks failed. Resolve the issues above or re-run with --force.");
  }
  if (problems.length > 0 && opts.force) {
    for (const problem of problems) {
      p16.log.warning(`Overridden by --force: ${problem}`);
    }
  }
  if (linkedWorktree) {
    const worktreeDirExists = existsSync2(linkedWorktree.worktree);
    const spinner10 = p16.spinner();
    if (worktreeDirExists) {
      spinner10.start(`Removing git worktree at ${linkedWorktree.worktree}...`);
      try {
        const removeArgs = ["worktree", "remove", linkedWorktree.worktree];
        if (opts.force)
          removeArgs.push("--force");
        execFileSync("git", removeArgs, {
          cwd: sourceCwd,
          stdio: ["ignore", "pipe", "pipe"]
        });
        spinner10.stop(`Removed git worktree at ${linkedWorktree.worktree}.`);
      } catch (error) {
        spinner10.stop(pc24.yellow(`Could not remove worktree cleanly, will prune instead.`));
        p16.log.warning(extractExecSyncErrorMessage(error) ?? String(error));
      }
    } else {
      spinner10.start("Pruning stale worktree entry...");
      execFileSync("git", ["worktree", "prune"], {
        cwd: sourceCwd,
        stdio: ["ignore", "pipe", "pipe"]
      });
      spinner10.stop("Pruned stale worktree entry.");
    }
  } else {
    execFileSync("git", ["worktree", "prune"], {
      cwd: sourceCwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
  }
  if (existsSync2(targetPath)) {
    const spinner10 = p16.spinner();
    spinner10.start(`Removing worktree directory ${targetPath}...`);
    rmSync(targetPath, { recursive: true, force: true });
    spinner10.stop(`Removed worktree directory ${targetPath}.`);
  }
  if (localBranchExists(sourceCwd, name)) {
    const spinner10 = p16.spinner();
    spinner10.start(`Deleting local branch "${name}"...`);
    try {
      const deleteFlag = opts.force ? "-D" : "-d";
      execFileSync("git", ["branch", deleteFlag, name], {
        cwd: sourceCwd,
        stdio: ["ignore", "pipe", "pipe"]
      });
      spinner10.stop(`Deleted local branch "${name}".`);
    } catch (error) {
      spinner10.stop(pc24.yellow(`Could not delete branch "${name}".`));
      p16.log.warning(extractExecSyncErrorMessage(error) ?? String(error));
    }
  }
  if (existsSync2(instanceRoot)) {
    const spinner10 = p16.spinner();
    spinner10.start(`Removing instance data at ${instanceRoot}...`);
    rmSync(instanceRoot, { recursive: true, force: true });
    spinner10.stop(`Removed instance data at ${instanceRoot}.`);
  }
  p16.outro(pc24.green("Cleanup complete."));
}
async function worktreeEnvCommand(opts) {
  const configPath = resolveConfigPath(opts.config);
  const envPath = resolvePaperclipEnvFile(configPath);
  const envEntries = readPaperclipEnvEntries(envPath);
  const out = {
    PAPERCLIP_CONFIG: configPath,
    ...envEntries.PAPERCLIP_HOME ? { PAPERCLIP_HOME: envEntries.PAPERCLIP_HOME } : {},
    ...envEntries.PAPERCLIP_INSTANCE_ID ? { PAPERCLIP_INSTANCE_ID: envEntries.PAPERCLIP_INSTANCE_ID } : {},
    ...envEntries.PAPERCLIP_CONTEXT ? { PAPERCLIP_CONTEXT: envEntries.PAPERCLIP_CONTEXT } : {},
    ...envEntries
  };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(formatShellExports(out));
}
function registerWorktreeCommands(program2) {
  const worktree = program2.command("worktree").description("Worktree-local Paperclip instance helpers");
  program2.command("worktree:make").description("Create ~/NAME as a git worktree, then initialize an isolated Paperclip instance inside it").argument("<name>", "Worktree name \u2014 auto-prefixed with paperclip- if needed (created at ~/paperclip-NAME)").option("--start-point <ref>", "Remote ref to base the new branch on (env: PAPERCLIP_WORKTREE_START_POINT)").option("--instance <id>", "Explicit isolated instance id").option("--home <path>", `Home root for worktree instances (env: PAPERCLIP_WORKTREES_DIR, default: ${DEFAULT_WORKTREE_HOME})`).option("--from-config <path>", "Source config.json to seed from").option("--from-data-dir <path>", "Source PAPERCLIP_HOME used when deriving the source config").option("--from-instance <id>", "Source instance id when deriving the source config", "default").option("--server-port <port>", "Preferred server port", (value) => Number(value)).option("--db-port <port>", "Preferred embedded Postgres port", (value) => Number(value)).option("--seed-mode <mode>", "Seed profile: minimal or full (default: minimal)", "minimal").option("--no-seed", "Skip database seeding from the source instance").option("--force", "Replace existing repo-local config and isolated instance data", false).action(worktreeMakeCommand);
  worktree.command("init").description("Create repo-local config/env and an isolated instance for this worktree").option("--name <name>", "Display name used to derive the instance id").option("--instance <id>", "Explicit isolated instance id").option("--home <path>", `Home root for worktree instances (env: PAPERCLIP_WORKTREES_DIR, default: ${DEFAULT_WORKTREE_HOME})`).option("--from-config <path>", "Source config.json to seed from").option("--from-data-dir <path>", "Source PAPERCLIP_HOME used when deriving the source config").option("--from-instance <id>", "Source instance id when deriving the source config", "default").option("--server-port <port>", "Preferred server port", (value) => Number(value)).option("--db-port <port>", "Preferred embedded Postgres port", (value) => Number(value)).option("--seed-mode <mode>", "Seed profile: minimal or full (default: minimal)", "minimal").option("--no-seed", "Skip database seeding from the source instance").option("--force", "Replace existing repo-local config and isolated instance data", false).action(worktreeInitCommand);
  worktree.command("env").description("Print shell exports for the current worktree-local Paperclip instance").option("-c, --config <path>", "Path to config file").option("--json", "Print JSON instead of shell exports").action(worktreeEnvCommand);
  program2.command("worktree:cleanup").description("Safely remove a worktree, its branch, and its isolated instance data").argument("<name>", "Worktree name \u2014 auto-prefixed with paperclip- if needed").option("--instance <id>", "Explicit instance id (if different from the worktree name)").option("--home <path>", `Home root for worktree instances (env: PAPERCLIP_WORKTREES_DIR, default: ${DEFAULT_WORKTREE_HOME})`).option("--force", "Bypass safety checks (uncommitted changes, unique commits)", false).action(worktreeCleanupCommand);
}

// src/commands/client/plugin.ts
import path22 from "node:path";
import pc25 from "picocolors";
function resolvePackageArg(packageArg, isLocal) {
  if (!isLocal)
    return packageArg;
  if (path22.isAbsolute(packageArg))
    return packageArg;
  if (packageArg.startsWith("~")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return path22.resolve(home, packageArg.slice(1).replace(/^[\\/]/, ""));
  }
  return path22.resolve(process.cwd(), packageArg);
}
function formatPlugin(p25) {
  const statusColor3 = p25.status === "ready" ? pc25.green(p25.status) : p25.status === "error" ? pc25.red(p25.status) : p25.status === "disabled" ? pc25.dim(p25.status) : pc25.yellow(p25.status);
  const parts = [
    `key=${pc25.bold(p25.pluginKey)}`,
    `status=${statusColor3}`,
    `version=${p25.version}`,
    `id=${pc25.dim(p25.id)}`
  ];
  if (p25.lastError) {
    parts.push(`error=${pc25.red(p25.lastError.slice(0, 80))}`);
  }
  return parts.join("  ");
}
function registerPluginCommands(program2) {
  const plugin = program2.command("plugin").description("Plugin lifecycle management");
  addCommonClientOptions(
    plugin.command("list").description("List installed plugins").option("--status <status>", "Filter by status (ready, error, disabled, installed, upgrade_pending)").action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const qs = opts.status ? `?status=${encodeURIComponent(opts.status)}` : "";
        const plugins2 = await ctx.api.get(`/api/plugins${qs}`);
        if (ctx.json) {
          printOutput(plugins2, { json: true });
          return;
        }
        const rows = plugins2 ?? [];
        if (rows.length === 0) {
          console.log(pc25.dim("No plugins installed."));
          return;
        }
        for (const p25 of rows) {
          console.log(formatPlugin(p25));
        }
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    plugin.command("install <package>").description(
      "Install a plugin from a local path or npm package.\n  Examples:\n    paperclipai plugin install ./my-plugin              # local path\n    paperclipai plugin install @acme/plugin-linear      # npm package\n    paperclipai plugin install @acme/plugin-linear@1.2  # pinned version"
    ).option("-l, --local", "Treat <package> as a local filesystem path", false).option("--version <version>", "Specific npm version to install (npm packages only)").action(async (packageArg, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const isLocal = opts.local || packageArg.startsWith("./") || packageArg.startsWith("../") || packageArg.startsWith("/") || packageArg.startsWith("~");
        const resolvedPackage = resolvePackageArg(packageArg, isLocal);
        if (!ctx.json) {
          console.log(
            pc25.dim(
              isLocal ? `Installing plugin from local path: ${resolvedPackage}` : `Installing plugin: ${resolvedPackage}${opts.version ? `@${opts.version}` : ""}`
            )
          );
        }
        const installedPlugin = await ctx.api.post("/api/plugins/install", {
          packageName: resolvedPackage,
          version: opts.version,
          isLocalPath: isLocal
        });
        if (ctx.json) {
          printOutput(installedPlugin, { json: true });
          return;
        }
        if (!installedPlugin) {
          console.log(pc25.dim("Install returned no plugin record."));
          return;
        }
        console.log(
          pc25.green(
            `\u2713 Installed ${pc25.bold(installedPlugin.pluginKey)} v${installedPlugin.version} (${installedPlugin.status})`
          )
        );
        if (installedPlugin.lastError) {
          console.log(pc25.red(`  Warning: ${installedPlugin.lastError}`));
        }
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    plugin.command("uninstall <pluginKey>").description(
      "Uninstall a plugin by its plugin key or database ID.\n  Use --force to hard-purge all state and config."
    ).option("--force", "Purge all plugin state and config (hard delete)", false).action(async (pluginKey, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const purge = opts.force === true;
        const qs = purge ? "?purge=true" : "";
        if (!ctx.json) {
          console.log(
            pc25.dim(
              purge ? `Uninstalling and purging plugin: ${pluginKey}` : `Uninstalling plugin: ${pluginKey}`
            )
          );
        }
        const result = await ctx.api.delete(
          `/api/plugins/${encodeURIComponent(pluginKey)}${qs}`
        );
        if (ctx.json) {
          printOutput(result, { json: true });
          return;
        }
        console.log(pc25.green(`\u2713 Uninstalled ${pc25.bold(pluginKey)}${purge ? " (purged)" : ""}`));
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    plugin.command("enable <pluginKey>").description("Enable a disabled or errored plugin").action(async (pluginKey, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const result = await ctx.api.post(
          `/api/plugins/${encodeURIComponent(pluginKey)}/enable`
        );
        if (ctx.json) {
          printOutput(result, { json: true });
          return;
        }
        console.log(pc25.green(`\u2713 Enabled ${pc25.bold(pluginKey)} \u2014 status: ${result?.status ?? "unknown"}`));
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    plugin.command("disable <pluginKey>").description("Disable a running plugin without uninstalling it").action(async (pluginKey, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const result = await ctx.api.post(
          `/api/plugins/${encodeURIComponent(pluginKey)}/disable`
        );
        if (ctx.json) {
          printOutput(result, { json: true });
          return;
        }
        console.log(pc25.dim(`Disabled ${pc25.bold(pluginKey)} \u2014 status: ${result?.status ?? "unknown"}`));
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    plugin.command("inspect <pluginKey>").description("Show full details for an installed plugin").action(async (pluginKey, opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const result = await ctx.api.get(
          `/api/plugins/${encodeURIComponent(pluginKey)}`
        );
        if (ctx.json) {
          printOutput(result, { json: true });
          return;
        }
        if (!result) {
          console.log(pc25.red(`Plugin not found: ${pluginKey}`));
          process.exit(1);
        }
        console.log(formatPlugin(result));
        if (result.lastError) {
          console.log(`
${pc25.red("Last error:")}
${result.lastError}`);
        }
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
  addCommonClientOptions(
    plugin.command("examples").description("List bundled example plugins available for local install").action(async (opts) => {
      try {
        const ctx = resolveCommandContext(opts);
        const examples = await ctx.api.get("/api/plugins/examples");
        if (ctx.json) {
          printOutput(examples, { json: true });
          return;
        }
        const rows = examples ?? [];
        if (rows.length === 0) {
          console.log(pc25.dim("No bundled examples available."));
          return;
        }
        for (const ex of rows) {
          console.log(
            `${pc25.bold(ex.displayName)}  ${pc25.dim(ex.pluginKey)}
  ${ex.description}
  ${pc25.cyan(`paperclipai plugin install ${ex.localPath}`)}`
          );
        }
      } catch (err) {
        handleCommandError(err);
      }
    })
  );
}

// src/commands/kit.ts
import path24 from "node:path";
import { pathToFileURL as pathToFileURL2 } from "node:url";
import * as p17 from "@clack/prompts";
import pc26 from "picocolors";

// src/kits/service.ts
init_home();
import fs17 from "node:fs";
import path23 from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// src/kits/catalog.ts
var BUNDLED_KIT_CATALOG = [
  {
    id: "creative-strategist-v1",
    packageDirName: "creative-strategist-v1",
    defaultBundleId: "creative-strategist-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "workflow"
  },
  {
    id: "growthub-email-marketing-v1",
    packageDirName: "growthub-email-marketing-v1",
    defaultBundleId: "growthub-email-marketing-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "operator"
  },
  {
    id: "growthub-open-higgsfield-studio-v1",
    packageDirName: "growthub-open-higgsfield-studio-v1",
    defaultBundleId: "growthub-open-higgsfield-studio-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio"
  },
  {
    id: "growthub-geo-seo-v1",
    packageDirName: "growthub-geo-seo-v1",
    defaultBundleId: "growthub-geo-seo-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio"
  },
  {
    id: "growthub-postiz-social-v1",
    packageDirName: "growthub-postiz-social-v1",
    defaultBundleId: "growthub-postiz-social-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio"
  },
  {
    id: "growthub-open-montage-studio-v1",
    packageDirName: "growthub-open-montage-studio-v1",
    defaultBundleId: "growthub-open-montage-studio-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio"
  },
  {
    id: "growthub-ai-website-cloner-v1",
    packageDirName: "growthub-ai-website-cloner-v1",
    defaultBundleId: "growthub-ai-website-cloner-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio"
  },
  {
    id: "growthub-twenty-crm-v1",
    packageDirName: "growthub-twenty-crm-v1",
    defaultBundleId: "growthub-twenty-crm-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio"
  },
  {
    id: "growthub-zernio-social-v1",
    packageDirName: "growthub-zernio-social-v1",
    defaultBundleId: "growthub-zernio-social-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio"
  }
];

// src/kits/contract.ts
function isManifestV2(manifest) {
  return manifest.schemaVersion === 2;
}
function isBundleManifestV2(manifest) {
  return manifest.schemaVersion === 2;
}
function normalizeManifest(manifest) {
  if (isManifestV2(manifest))
    return manifest;
  return {
    schemaVersion: 2,
    kit: {
      ...manifest.kit,
      type: "worker"
    },
    entrypoint: manifest.entrypoint,
    workerIds: manifest.workerIds,
    agentContractPath: manifest.agentContractPath,
    brandTemplatePath: manifest.brandTemplatePath,
    publicExampleBrandPaths: manifest.publicExampleBrandPaths,
    frozenAssetPaths: manifest.frozenAssetPaths,
    outputStandard: manifest.outputStandard,
    bundles: manifest.bundles,
    executionMode: "export",
    activationModes: ["export"],
    compatibility: {},
    provenance: manifest.kit.sourceRepo ? { sourceRepo: manifest.kit.sourceRepo } : void 0
  };
}
function normalizeBundleManifest(manifest) {
  if (isBundleManifestV2(manifest))
    return manifest;
  return {
    schemaVersion: 2,
    bundle: manifest.bundle,
    briefType: manifest.briefType,
    publicExampleBrandPaths: manifest.publicExampleBrandPaths,
    requiredFrozenAssets: manifest.requiredFrozenAssets,
    optionalPresets: manifest.optionalPresets,
    export: manifest.export,
    activationModes: ["export"]
  };
}
var SUPPORTED_SCHEMA_VERSIONS = [1, 2];
var KIT_CAPABILITY_TYPES = [
  "worker",
  "workflow",
  "output",
  "ui"
];
var KIT_ACTIVATION_MODES = [
  "export",
  "install",
  "mount",
  "run"
];

// src/kits/service.ts
var ZIP_TIMESTAMP = /* @__PURE__ */ new Date("2026-04-09T00:00:00.000Z");
function resolveBundledKitAssetsRoot() {
  const moduleDir = path23.dirname(fileURLToPath4(import.meta.url));
  const candidates = [
    path23.resolve(moduleDir, "../../assets/worker-kits"),
    path23.resolve(moduleDir, "../assets/worker-kits")
  ];
  for (const candidate of candidates) {
    if (fs17.existsSync(candidate))
      return candidate;
  }
  throw new Error("Could not locate bundled worker kit assets.");
}
function resolveRequestedOutputRoot(outDir) {
  if (outDir?.trim()) {
    return path23.resolve(expandHomePrefix(outDir.trim()));
  }
  return path23.resolve(resolvePaperclipHomeDir(), "kits", "exports");
}
function readJsonFile(filePath) {
  return JSON.parse(fs17.readFileSync(filePath, "utf8"));
}
function assertRelativePathExists(assetRoot, relativePath, label) {
  const fullPath = path23.resolve(assetRoot, relativePath);
  if (!fs17.existsSync(fullPath)) {
    throw new Error(`${label} is missing required path: ${relativePath}`);
  }
}
function listRelativeFiles(rootDir) {
  const files = [];
  const walk = (currentDir) => {
    for (const entry of fs17.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path23.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      files.push(path23.relative(rootDir, fullPath).split(path23.sep).join("/"));
    }
  };
  walk(rootDir);
  return files.sort();
}
function parseManifest(assetRoot) {
  const raw = readJsonFile(path23.resolve(assetRoot, "kit.json"));
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(raw.schemaVersion)) {
    throw new Error(`Unsupported kit schema version for ${assetRoot}: ${raw.schemaVersion}`);
  }
  return normalizeManifest(raw);
}
function parseBundleManifest(assetRoot, manifest, bundleId) {
  const bundleRef = manifest.bundles.find((item) => item.id === bundleId);
  if (!bundleRef) {
    throw new Error(`Kit ${manifest.kit.id} does not declare bundle ${bundleId}.`);
  }
  const raw = readJsonFile(path23.resolve(assetRoot, bundleRef.path));
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(raw.schemaVersion)) {
    throw new Error(
      `Unsupported bundle schema version for ${bundleRef.path}: ${raw.schemaVersion}`
    );
  }
  return normalizeBundleManifest(raw);
}
function validateBundledKit(resolved) {
  const { assetRoot, manifest, bundleManifest } = resolved;
  if (manifest.kit.id !== resolved.catalogEntry.id) {
    throw new Error(
      `Bundled catalog mismatch: expected ${resolved.catalogEntry.id}, got ${manifest.kit.id}.`
    );
  }
  if (bundleManifest.bundle.kitId !== manifest.kit.id) {
    throw new Error(
      `Bundle ${bundleManifest.bundle.id} points at ${bundleManifest.bundle.kitId}, expected ${manifest.kit.id}.`
    );
  }
  if (bundleManifest.bundle.workerId !== manifest.entrypoint.workerId) {
    throw new Error(
      `Bundle ${bundleManifest.bundle.id} worker mismatch: ${bundleManifest.bundle.workerId} vs ${manifest.entrypoint.workerId}.`
    );
  }
  assertRelativePathExists(assetRoot, manifest.entrypoint.path, "Kit manifest");
  assertRelativePathExists(assetRoot, manifest.agentContractPath, "Kit manifest");
  assertRelativePathExists(assetRoot, manifest.brandTemplatePath, "Kit manifest");
  for (const bundle of manifest.bundles) {
    assertRelativePathExists(assetRoot, bundle.path, "Kit manifest bundle");
  }
  for (const relativePath of manifest.frozenAssetPaths) {
    assertRelativePathExists(assetRoot, relativePath, "Kit manifest");
  }
  for (const requiredPath of manifest.outputStandard.requiredPaths) {
    assertRelativePathExists(assetRoot, requiredPath, "Output standard");
  }
  for (const relativePath of bundleManifest.requiredFrozenAssets) {
    assertRelativePathExists(assetRoot, relativePath, "Bundle manifest");
  }
  const kitPublicBrands = new Set(manifest.publicExampleBrandPaths ?? []);
  const bundlePublicBrands = new Set(bundleManifest.publicExampleBrandPaths ?? []);
  for (const brandPath of kitPublicBrands) {
    if (!bundlePublicBrands.has(brandPath)) {
      throw new Error(`Bundle ${bundleManifest.bundle.id} is missing declared public brand ${brandPath}.`);
    }
  }
  const bundledFiles = listRelativeFiles(assetRoot);
  const brandKitFiles = bundledFiles.filter((filePath) => filePath.startsWith("brands/") && filePath.endsWith("/brand-kit.md"));
  const allowedBrandPaths = /* @__PURE__ */ new Set([
    manifest.brandTemplatePath,
    ...manifest.publicExampleBrandPaths ?? []
  ]);
  const disallowedBrandFiles = brandKitFiles.filter((filePath) => !allowedBrandPaths.has(filePath));
  if (disallowedBrandFiles.length > 0) {
    throw new Error(
      `Bundled kit ${manifest.kit.id} includes non-public brand kits: ${disallowedBrandFiles.join(", ")}`
    );
  }
}
function validateKitDirectory(kitPath) {
  const errors = [];
  const warnings = [];
  let schemaVersion = 0;
  let kitId = "<unknown>";
  const kitJsonPath = path23.resolve(kitPath, "kit.json");
  if (!fs17.existsSync(kitJsonPath)) {
    errors.push({ field: "kit.json", message: "kit.json not found in kit directory" });
    return { valid: false, schemaVersion, kitId, errors, warnings };
  }
  let raw;
  try {
    raw = JSON.parse(fs17.readFileSync(kitJsonPath, "utf8"));
  } catch {
    errors.push({ field: "kit.json", message: "kit.json is not valid JSON" });
    return { valid: false, schemaVersion, kitId, errors, warnings };
  }
  schemaVersion = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
    errors.push({
      field: "schemaVersion",
      message: `Unsupported schema version ${schemaVersion}. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`
    });
    return { valid: false, schemaVersion, kitId, errors, warnings };
  }
  const kitBlock = raw.kit;
  if (!kitBlock || typeof kitBlock !== "object") {
    errors.push({ field: "kit", message: "Missing required 'kit' block" });
    return { valid: false, schemaVersion, kitId, errors, warnings };
  }
  kitId = typeof kitBlock.id === "string" ? kitBlock.id : "<unknown>";
  for (const field of ["id", "version", "name", "description"]) {
    if (typeof kitBlock[field] !== "string" || kitBlock[field].trim() === "") {
      errors.push({ field: `kit.${field}`, message: `Missing or empty required field 'kit.${field}'` });
    }
  }
  if (schemaVersion === 2) {
    const kitType = kitBlock.type;
    if (!kitType || !KIT_CAPABILITY_TYPES.includes(kitType)) {
      errors.push({
        field: "kit.type",
        message: `Invalid or missing kit.type. Expected one of: ${KIT_CAPABILITY_TYPES.join(", ")}`
      });
    }
    const execMode = raw.executionMode;
    if (!execMode) {
      errors.push({ field: "executionMode", message: "Missing required field 'executionMode'" });
    } else if (!KIT_ACTIVATION_MODES.includes(execMode)) {
      errors.push({
        field: "executionMode",
        message: `Invalid executionMode '${execMode}'. Expected one of: ${KIT_ACTIVATION_MODES.join(", ")}`
      });
    }
    const activationModes = raw.activationModes;
    if (!Array.isArray(activationModes) || activationModes.length === 0) {
      errors.push({ field: "activationModes", message: "Missing or empty 'activationModes' array" });
    } else {
      for (const mode of activationModes) {
        if (!KIT_ACTIVATION_MODES.includes(mode)) {
          errors.push({
            field: "activationModes",
            message: `Invalid activation mode '${mode}'. Expected one of: ${KIT_ACTIVATION_MODES.join(", ")}`
          });
        }
      }
    }
  } else {
    warnings.push({ field: "schemaVersion", message: "Kit uses schema v1. Consider upgrading to v2 for capability metadata." });
  }
  const entrypoint = raw.entrypoint;
  if (!entrypoint || typeof entrypoint !== "object") {
    errors.push({ field: "entrypoint", message: "Missing required 'entrypoint' block" });
  } else {
    if (typeof entrypoint.workerId !== "string") {
      errors.push({ field: "entrypoint.workerId", message: "Missing required field 'entrypoint.workerId'" });
    }
    if (typeof entrypoint.path !== "string") {
      errors.push({ field: "entrypoint.path", message: "Missing required field 'entrypoint.path'" });
    } else {
      const fullPath = path23.resolve(kitPath, entrypoint.path);
      if (!fs17.existsSync(fullPath)) {
        errors.push({ field: "entrypoint.path", message: `Entrypoint file not found: ${entrypoint.path}` });
      }
    }
  }
  if (typeof raw.agentContractPath !== "string") {
    errors.push({ field: "agentContractPath", message: "Missing required field 'agentContractPath'" });
  } else {
    const fullPath = path23.resolve(kitPath, raw.agentContractPath);
    if (!fs17.existsSync(fullPath)) {
      errors.push({ field: "agentContractPath", message: `Agent contract not found: ${raw.agentContractPath}` });
    }
  }
  if (typeof raw.brandTemplatePath !== "string") {
    errors.push({ field: "brandTemplatePath", message: "Missing required field 'brandTemplatePath'" });
  } else {
    const fullPath = path23.resolve(kitPath, raw.brandTemplatePath);
    if (!fs17.existsSync(fullPath)) {
      errors.push({ field: "brandTemplatePath", message: `Brand template not found: ${raw.brandTemplatePath}` });
    }
  }
  const frozenAssets = raw.frozenAssetPaths;
  if (!Array.isArray(frozenAssets)) {
    errors.push({ field: "frozenAssetPaths", message: "Missing required 'frozenAssetPaths' array" });
  } else {
    for (const assetPath of frozenAssets) {
      if (typeof assetPath !== "string")
        continue;
      const fullPath = path23.resolve(kitPath, assetPath);
      if (!fs17.existsSync(fullPath)) {
        errors.push({ field: "frozenAssetPaths", message: `Frozen asset not found: ${assetPath}` });
      }
    }
  }
  const outputStandard = raw.outputStandard;
  if (!outputStandard || typeof outputStandard !== "object") {
    errors.push({ field: "outputStandard", message: "Missing required 'outputStandard' block" });
  } else {
    if (typeof outputStandard.type !== "string") {
      errors.push({ field: "outputStandard.type", message: "Missing required field 'outputStandard.type'" });
    }
    const requiredPaths = outputStandard.requiredPaths;
    if (!Array.isArray(requiredPaths)) {
      errors.push({ field: "outputStandard.requiredPaths", message: "Missing required 'outputStandard.requiredPaths' array" });
    } else {
      for (const reqPath of requiredPaths) {
        if (typeof reqPath !== "string")
          continue;
        const fullPath = path23.resolve(kitPath, reqPath);
        if (!fs17.existsSync(fullPath)) {
          errors.push({ field: "outputStandard.requiredPaths", message: `Required output path not found: ${reqPath}` });
        }
      }
    }
  }
  const bundles = raw.bundles;
  if (!Array.isArray(bundles) || bundles.length === 0) {
    errors.push({ field: "bundles", message: "Missing or empty 'bundles' array" });
  } else {
    for (const bundleRef of bundles) {
      const ref = bundleRef;
      if (typeof ref.path !== "string") {
        errors.push({ field: "bundles[].path", message: "Bundle ref missing 'path' field" });
        continue;
      }
      const bundlePath = path23.resolve(kitPath, ref.path);
      if (!fs17.existsSync(bundlePath)) {
        errors.push({ field: "bundles[].path", message: `Bundle manifest not found: ${ref.path}` });
        continue;
      }
      try {
        const bundleRaw = JSON.parse(fs17.readFileSync(bundlePath, "utf8"));
        const bundleBlock = bundleRaw.bundle;
        if (!bundleBlock || typeof bundleBlock !== "object") {
          errors.push({ field: `bundle(${ref.id})`, message: "Bundle manifest missing 'bundle' block" });
        } else {
          if (bundleBlock.kitId !== kitId) {
            errors.push({
              field: `bundle(${ref.id}).kitId`,
              message: `Bundle kitId '${bundleBlock.kitId}' does not match kit id '${kitId}'`
            });
          }
        }
        if (!bundleRaw.export || typeof bundleRaw.export !== "object") {
          errors.push({ field: `bundle(${ref.id}).export`, message: "Bundle manifest missing 'export' block" });
        }
      } catch {
        errors.push({ field: `bundle(${ref.id})`, message: `Bundle manifest at ${ref.path} is not valid JSON` });
      }
    }
  }
  return {
    valid: errors.length === 0,
    schemaVersion,
    kitId,
    errors,
    warnings
  };
}
function loadResolvedBundledKit(assetRoot, catalogEntry) {
  const manifest = parseManifest(assetRoot);
  const bundleManifest = parseBundleManifest(assetRoot, manifest, catalogEntry.defaultBundleId);
  const resolved = { catalogEntry, assetRoot, manifest, bundleManifest };
  validateBundledKit(resolved);
  return resolved;
}
function fuzzyResolveKitId(input) {
  const needle = input.toLowerCase().trim();
  const exact = BUNDLED_KIT_CATALOG.find((e) => e.id === needle);
  if (exact)
    return exact.id;
  const suffix = BUNDLED_KIT_CATALOG.find((e) => e.id.endsWith(needle));
  if (suffix)
    return suffix.id;
  const contains = BUNDLED_KIT_CATALOG.find((e) => e.id.includes(needle));
  if (contains)
    return contains.id;
  const tokens = needle.split(/[-\s]+/).filter((t) => t.length > 2);
  for (const token of tokens) {
    const tokenMatch = BUNDLED_KIT_CATALOG.find((e) => e.id.includes(token));
    if (tokenMatch)
      return tokenMatch.id;
  }
  return null;
}
function resolveBundledKit(kitId) {
  const resolvedId = fuzzyResolveKitId(kitId);
  if (!resolvedId) {
    const available = BUNDLED_KIT_CATALOG.map((e) => e.id).join(", ");
    throw new Error(
      `Unknown kit '${kitId}'. Run 'growthub kit list' to browse available kits.
Available: ${available}`
    );
  }
  const catalogEntry = BUNDLED_KIT_CATALOG.find((e) => e.id === resolvedId);
  const assetRoot = path23.resolve(resolveBundledKitAssetsRoot(), catalogEntry.packageDirName);
  return loadResolvedBundledKit(assetRoot, catalogEntry);
}
function toListItem(resolved) {
  return {
    id: resolved.manifest.kit.id,
    version: resolved.manifest.kit.version,
    name: resolved.manifest.kit.name,
    description: resolved.manifest.kit.description,
    type: resolved.manifest.kit.type,
    family: resolved.catalogEntry.family,
    executionMode: resolved.manifest.executionMode,
    activationModes: resolved.manifest.activationModes,
    bundleId: resolved.bundleManifest.bundle.id,
    bundleVersion: resolved.bundleManifest.bundle.version,
    briefType: resolved.bundleManifest.briefType
  };
}
function resolveOutputPaths(resolved, outDir) {
  const outputRoot = resolveRequestedOutputRoot(outDir);
  const folderPath = path23.resolve(outputRoot, resolved.bundleManifest.export.folderName);
  const zipPath = path23.resolve(outputRoot, resolved.bundleManifest.export.zipFileName);
  return { outputRoot, folderPath, zipPath };
}
function listBundledKits() {
  return BUNDLED_KIT_CATALOG.map((entry) => toListItem(resolveBundledKit(entry.id)));
}
function inspectBundledKit(kitId, outDir) {
  const resolved = resolveBundledKit(kitId);
  const outputPaths = resolveOutputPaths(resolved, outDir);
  return {
    ...toListItem(resolved),
    entrypointPath: resolved.manifest.entrypoint.path,
    agentContractPath: resolved.manifest.agentContractPath,
    brandTemplatePath: resolved.manifest.brandTemplatePath,
    publicExampleBrandPaths: resolved.manifest.publicExampleBrandPaths ?? [],
    frozenAssetCount: resolved.manifest.frozenAssetPaths.length,
    requiredFrozenAssetCount: resolved.bundleManifest.requiredFrozenAssets.length,
    outputRoot: outputPaths.outputRoot,
    exportFolderName: resolved.bundleManifest.export.folderName,
    exportFolderPath: outputPaths.folderPath,
    exportZipName: resolved.bundleManifest.export.zipFileName,
    exportZipPath: outputPaths.zipPath,
    requiredPaths: resolved.manifest.outputStandard.requiredPaths,
    compatibility: resolved.manifest.compatibility,
    schemaVersion: resolved.manifest.schemaVersion
  };
}
function resolveKitPath(kitId, outDir) {
  const resolved = resolveBundledKit(kitId);
  return resolveOutputPaths(resolved, outDir).folderPath;
}
function crc32(buffer) {
  let crc = 4294967295;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc >>> 1 ^ 3988292384 & -(crc & 1);
    }
  }
  return (crc ^ 4294967295) >>> 0;
}
function toDosTimeParts(date2) {
  const year = Math.max(date2.getUTCFullYear(), 1980);
  const month = date2.getUTCMonth() + 1;
  const day = date2.getUTCDate();
  const hours = date2.getUTCHours();
  const minutes = date2.getUTCMinutes();
  const seconds = Math.floor(date2.getUTCSeconds() / 2);
  return {
    dosTime: hours << 11 | minutes << 5 | seconds,
    dosDate: year - 1980 << 9 | month << 5 | day
  };
}
function buildStoredZip(entries) {
  const parts = [];
  const centralDirectoryParts = [];
  let offset = 0;
  const { dosTime, dosDate } = toDosTimeParts(ZIP_TIMESTAMP);
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(67324752, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuffer.copy(localHeader, 30);
    parts.push(localHeader, data);
    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(33639248, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuffer.copy(centralHeader, 46);
    centralDirectoryParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralDirectoryParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(101010256, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralDirectory, endRecord]);
}
function reportProgress(onProgress, progress) {
  onProgress?.(progress);
}
function copyDirectoryWithProgress(sourceRoot, targetRoot, onProgress) {
  const files = listRelativeFiles(sourceRoot);
  const total = Math.max(files.length, 1);
  fs17.mkdirSync(targetRoot, { recursive: true });
  reportProgress(onProgress, {
    phase: "copying",
    completed: 0,
    total,
    percent: 10,
    detail: "Preparing files"
  });
  files.forEach((relativePath, index51) => {
    const sourcePath = path23.resolve(sourceRoot, relativePath);
    const targetPath = path23.resolve(targetRoot, relativePath);
    fs17.mkdirSync(path23.dirname(targetPath), { recursive: true });
    fs17.copyFileSync(sourcePath, targetPath);
    const completed = index51 + 1;
    const percent = 10 + Math.round(completed / total * 55);
    reportProgress(onProgress, {
      phase: "copying",
      completed,
      total,
      percent,
      detail: relativePath
    });
  });
}
function buildZipEntriesWithProgress(sourceRoot, exportFolderName, onProgress) {
  const files = listRelativeFiles(sourceRoot);
  const total = Math.max(files.length, 1);
  return files.map((relativePath, index51) => {
    const completed = index51 + 1;
    const percent = 65 + Math.round(completed / total * 30);
    reportProgress(onProgress, {
      phase: "zipping",
      completed,
      total,
      percent,
      detail: relativePath
    });
    return {
      name: path23.posix.join(exportFolderName, relativePath),
      data: fs17.readFileSync(path23.resolve(sourceRoot, relativePath))
    };
  });
}
function downloadBundledKit(kitId, outDir, options = {}) {
  const resolved = resolveBundledKit(kitId);
  const outputPaths = resolveOutputPaths(resolved, outDir);
  const onProgress = options.onProgress;
  reportProgress(onProgress, {
    phase: "preparing",
    completed: 0,
    total: 1,
    percent: 0,
    detail: "Resolving export target"
  });
  fs17.mkdirSync(outputPaths.outputRoot, { recursive: true });
  fs17.rmSync(outputPaths.folderPath, { recursive: true, force: true });
  copyDirectoryWithProgress(resolved.assetRoot, outputPaths.folderPath, onProgress);
  const zipBuffer = buildStoredZip(
    buildZipEntriesWithProgress(outputPaths.folderPath, resolved.bundleManifest.export.folderName, onProgress)
  );
  reportProgress(onProgress, {
    phase: "writing_zip",
    completed: 1,
    total: 1,
    percent: 98,
    detail: path23.basename(outputPaths.zipPath)
  });
  fs17.writeFileSync(outputPaths.zipPath, zipBuffer);
  reportProgress(onProgress, {
    phase: "done",
    completed: 1,
    total: 1,
    percent: 100,
    detail: "Export complete"
  });
  return {
    folderPath: outputPaths.folderPath,
    zipPath: outputPaths.zipPath
  };
}

// src/commands/kit.ts
init_banner();
var TYPE_CONFIG = {
  studio: { color: pc26.cyan, emoji: "\u{1F6E0}\uFE0F", label: "Custom Workspaces" },
  specialized_agents: { color: pc26.magenta, emoji: "\u{1F9E0}", label: "Specialized Agents" },
  ops: { color: pc26.yellow, emoji: "\u2699\uFE0F ", label: "Ops" }
};
function displayTypeForFamily(family) {
  if (family === "workflow" || family === "operator")
    return "specialized_agents";
  if (family === "studio" || family === "ops")
    return family;
  return family;
}
function typeColor(family, text63) {
  const type = displayTypeForFamily(family);
  return TYPE_CONFIG[type]?.color(text63) ?? text63;
}
function typeBadge(family) {
  const type = displayTypeForFamily(family);
  const cfg = TYPE_CONFIG[type];
  if (!cfg)
    return String(type);
  return cfg.color(`${cfg.emoji} ${cfg.label}`);
}
function truncate(str, max) {
  if (str.length <= max)
    return str;
  return str.slice(0, max - 1) + "\u2026";
}
function displayKitName(name) {
  return name.replace(/^Growthub Agent Worker Kit\s+[—-]\s+/u, "").trim();
}
function hr(width = 72) {
  return pc26.dim("\u2500".repeat(width));
}
function box(lines) {
  const padded = lines.map((l) => "  " + l);
  const width = Math.max(...padded.map((l) => stripAnsi(l).length)) + 4;
  const top = pc26.dim("\u250C" + "\u2500".repeat(width) + "\u2510");
  const bottom = pc26.dim("\u2514" + "\u2500".repeat(width) + "\u2518");
  const body = padded.map((l) => {
    const pad = width - stripAnsi(l).length;
    return pc26.dim("\u2502") + l + " ".repeat(pad) + pc26.dim("\u2502");
  });
  return [top, ...body, bottom].join("\n");
}
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}
function terminalLink(label, href) {
  return `\x1B]8;;${href}\x07${label}\x1B]8;;\x07`;
}
function folderOpenLabel(folderPath) {
  const href = pathToFileURL2(folderPath).href;
  const label = process.platform === "darwin" ? "Open in Finder" : process.platform === "win32" ? "Open in Explorer" : "Open folder";
  return terminalLink(label, href);
}
function renderProgressBar(progress) {
  if (!process.stdout.isTTY)
    return;
  const width = 24;
  const filled = Math.max(0, Math.min(width, Math.round(progress.percent / 100 * width)));
  const bar = `${"=".repeat(filled)}${"-".repeat(width - filled)}`;
  const detail = truncate(progress.detail, 48);
  const line = `\r${pc26.cyan("Exporting kit")} ${pc26.dim("[")}${pc26.green(bar)}${pc26.dim("]")} ${String(progress.percent).padStart(3)}% ${pc26.dim(detail)}`;
  process.stdout.write(line);
  if (progress.phase === "done") {
    process.stdout.write("\n");
  }
}
function printKitCard(item) {
  const badge2 = typeBadge(item.family);
  console.log("");
  console.log(box([
    `${pc26.bold(item.name)}  ${pc26.dim("v" + item.version)}`,
    `${badge2}  ${pc26.dim(item.id)}`,
    "",
    truncate(item.description, 62),
    "",
    `${pc26.dim("Brief:")} ${pc26.dim(item.briefType)}   ${pc26.dim("Mode:")} ${pc26.dim(item.executionMode)}`
  ]));
}
function getActionLabel(action) {
  if (action === "download")
    return "download";
  if (action === "inspect")
    return "inspect";
  if (action === "copy-id")
    return "print id";
  return action;
}
async function confirmKitActions(input) {
  const actionLabels = input.actions.map((action) => {
    return getActionLabel(action);
  });
  const summaryLines = [
    pc26.bold("Selected kits"),
    ...input.kits.map((kit) => `${typeBadge(kit.family)}  ${displayKitName(kit.name)}`),
    "",
    pc26.bold("Selected actions"),
    actionLabels.join(", ")
  ];
  console.log("");
  console.log(box(summaryLines));
  const confirmed = await p17.confirm({
    message: "Continue with these worker kit actions?",
    initialValue: false
  });
  if (p17.isCancel(confirmed)) {
    p17.cancel("Cancelled.");
    process.exit(0);
  }
  return Boolean(confirmed);
}
function printGroupedList(kits) {
  const byType = {};
  for (const kit of kits) {
    const type = displayTypeForFamily(kit.family);
    (byType[type] ??= []).push(kit);
  }
  const types = Object.keys(byType).sort();
  const totalTypes = types.length;
  console.log("");
  console.log(
    pc26.bold("Growthub Agent Worker Kits") + pc26.dim(`  ${kits.length} kit${kits.length !== 1 ? "s" : ""} \xB7 ${totalTypes} type${totalTypes !== 1 ? "s" : ""}`)
  );
  console.log(hr());
  for (const type of types) {
    const groupKits = byType[type];
    const header = typeBadge(type);
    console.log(`
${header}  ${pc26.dim("(" + groupKits.length + ")")}`);
    for (const kit of groupKits) {
      console.log(`  ${typeColor(kit.family, pc26.bold(kit.id))}  ${pc26.dim("v" + kit.version)}`);
      console.log(`  ${pc26.dim(truncate(kit.description, 62))}`);
      console.log(`  ${pc26.dim("\u2192")} ${pc26.cyan("growthub kit download " + kit.id)}`);
      console.log("");
    }
  }
  console.log(hr());
  console.log(pc26.dim("  growthub kit download <id>  \xB7  growthub kit inspect <id>  \xB7  growthub kit families"));
  console.log("");
}
async function runInteractivePicker(opts) {
  printPaperclipCliBanner();
  p17.intro(pc26.bold("Growthub Agent Worker Kits"));
  let kits;
  try {
    kits = listBundledKits();
  } catch (err) {
    p17.log.error("Failed to load kits: " + err.message);
    process.exit(1);
  }
  const familiesAvailable = [...new Set(kits.map((k) => k.family))].sort();
  const typeOptions = Array.from(new Set(familiesAvailable.map((family) => displayTypeForFamily(family))));
  while (true) {
    const typeChoice = await p17.select({
      message: "Filter by type",
      options: [
        { value: "all", label: "All Types" },
        ...typeOptions.map((type) => {
          const cfg = TYPE_CONFIG[type];
          return {
            value: type,
            label: cfg ? cfg.emoji + "  " + cfg.label : String(type)
          };
        }),
        ...opts.allowBackToHub ? [{ value: "__back_to_hub", label: "\u2190 Back to main menu" }] : []
      ]
    });
    if (p17.isCancel(typeChoice)) {
      p17.cancel("Cancelled.");
      process.exit(0);
    }
    if (typeChoice === "__back_to_hub")
      return "back";
    const filtered = typeChoice === "all" ? kits : kits.filter((k) => displayTypeForFamily(k.family) === typeChoice);
    const showTypeBadgeInKitChoices = typeChoice === "all";
    if (filtered.length === 0) {
      p17.note("No kits are available for that type yet.", "Nothing found");
      continue;
    }
    while (true) {
      const kitChoice = await p17.select({
        message: "Select kit",
        options: [
          ...filtered.map((k) => ({
            value: k.id,
            label: (showTypeBadgeInKitChoices ? typeBadge(k.family) + "  " : "") + pc26.bold(displayKitName(k.name)) + "  " + pc26.dim("v" + k.version),
            hint: truncate(k.description, 55)
          })),
          { value: "__back_to_type", label: "\u2190 Back to type filter" }
        ]
      });
      if (p17.isCancel(kitChoice)) {
        p17.cancel("Cancelled.");
        process.exit(0);
      }
      if (kitChoice === "__back_to_type")
        break;
      const selected = filtered.find((kit) => kit.id === kitChoice);
      if (!selected) {
        p17.cancel("Selected kit was not found.");
        process.exit(1);
      }
      printKitCard(selected);
      const nextStep = await p17.select({
        message: "Next step",
        options: [
          { value: "actions", label: "Choose action(s)" },
          { value: "back_to_kits", label: "\u2190 Back to kit list" }
        ]
      });
      if (p17.isCancel(nextStep)) {
        p17.cancel("Cancelled.");
        process.exit(0);
      }
      if (nextStep === "back_to_kits")
        continue;
      while (true) {
        const action = await p17.select({
          message: "What would you like to do?",
          options: [
            { value: "download", label: "\u2B07\uFE0F  Download kit", hint: "growthub kit download <id>" },
            { value: "inspect", label: "\u{1F50D} Inspect manifest", hint: "growthub kit inspect <id>" },
            { value: "copy-id", label: "\u{1F4CB} Print ID to stdout", hint: "echo <kit-id>" },
            { value: "back_to_kits", label: "\u2190 Back to kit list" }
          ]
        });
        if (p17.isCancel(action)) {
          p17.cancel("Cancelled.");
          process.exit(0);
        }
        if (action === "back_to_kits")
          break;
        const confirmed = await confirmKitActions({
          kits: [selected],
          actions: [action]
        });
        if (!confirmed) {
          const reviewChoice = await p17.select({
            message: "Review selection",
            options: [
              { value: "actions", label: `Choose ${getActionLabel(action)} again` },
              { value: "back_to_kits", label: "\u2190 Back to kit list" }
            ]
          });
          if (p17.isCancel(reviewChoice)) {
            p17.cancel("Cancelled.");
            process.exit(0);
          }
          if (reviewChoice === "back_to_kits")
            break;
          continue;
        }
        if (action === "copy-id") {
          console.log(selected.id);
          p17.outro(pc26.dim("Kit ID printed above."));
          return "done";
        }
        if (action === "inspect") {
          runInspect(selected.id, opts.out);
          p17.outro(pc26.dim("Done."));
          return "done";
        }
        await runDownload(selected.id, opts);
        p17.outro(pc26.green("Kit exported successfully."));
        return "done";
      }
    }
  }
}
async function runDownload(kitId, opts) {
  const resolvedId = fuzzyResolveKitId(kitId);
  if (!resolvedId) {
    console.error(pc26.red("Unknown kit '" + kitId + "'.") + pc26.dim(" Run `growthub kit list` to browse."));
    process.exit(1);
  }
  if (resolvedId !== kitId) {
    console.log(pc26.dim("Resolved '" + kitId + "' \u2192 " + resolvedId));
  }
  const kits = listBundledKits();
  const item = kits.find((k) => k.id === resolvedId);
  printKitCard(item);
  if (!opts.yes) {
    const confirmed = await p17.confirm({ message: "Download " + pc26.bold(displayKitName(item.name)) + "?" });
    if (p17.isCancel(confirmed) || !confirmed) {
      p17.cancel("Cancelled.");
      process.exit(0);
    }
  }
  const result = downloadBundledKit(resolvedId, opts.out, {
    onProgress: renderProgressBar
  });
  console.log("");
  console.log(pc26.green(pc26.bold("Kit exported successfully.")));
  console.log("");
  const nextSteps = [
    pc26.bold("Next steps"),
    "",
    pc26.dim("1.") + " Point Working Directory at:",
    "   " + pc26.cyan(result.folderPath),
    "",
    pc26.dim("2.") + " " + pc26.cyan("cp .env.example .env") + "  \u2192  add your API key",
    pc26.dim("3.") + " " + pc26.cyan("bash setup/clone-fork.sh") + "  \u2192  boot local studio",
    pc26.dim("4.") + " Open Growthub local \u2014 the agent loads automatically",
    "",
    pc26.dim("Docs: QUICKSTART.md \xB7 validation-checklist.md")
  ];
  console.log("");
  console.log(box(nextSteps));
  console.log("");
  console.log(pc26.bold("Open folder: ") + folderOpenLabel(result.folderPath));
  console.log(pc26.dim("Folder: ") + result.folderPath);
  console.log("");
  console.log(pc26.dim("Zip: ") + result.zipPath);
  console.log("");
}
function runInspect(kitId, outDir) {
  const info = inspectBundledKit(kitId, outDir);
  const kv = (label, value) => console.log("  " + pc26.bold(label.padEnd(24)) + " " + value);
  console.log("");
  console.log(pc26.bold("Kit: " + info.id) + pc26.dim("  v" + info.version));
  console.log(typeBadge(info.family) + pc26.dim("  schema v" + info.schemaVersion));
  console.log(hr());
  kv("Name:", info.name);
  kv("Description:", truncate(info.description, 55));
  kv("Entrypoint:", info.entrypointPath);
  kv("Agent Contract:", info.agentContractPath);
  kv("Bundle:", info.bundleId + " @ " + info.bundleVersion);
  kv("Brief Type:", info.briefType);
  kv("Frozen Assets:", String(info.frozenAssetCount));
  kv("Required Assets:", String(info.requiredFrozenAssetCount));
  kv("Export Folder:", info.exportFolderPath);
  kv("Export Zip:", info.exportZipPath);
  if (Object.keys(info.compatibility).length > 0) {
    kv("Compatibility:", JSON.stringify(info.compatibility));
  }
  console.log(hr());
  console.log(pc26.bold("  Required Paths:"));
  for (const rp of info.requiredPaths)
    console.log("    " + pc26.dim("\xB7") + " " + rp);
  console.log("");
}
function registerKitCommands(program2) {
  const kit = program2.command("kit").description("Browse, inspect, and download Growthub Agent Worker Kits").addHelpText("after", `
Examples:
  $ growthub kit                          # interactive browser
  $ growthub kit list                     # all kits grouped by type
  $ growthub kit list --family studio     # filter by family
  $ growthub kit list --json              # machine-readable output
  $ growthub kit download higgsfield      # fuzzy slug \u2014 resolves automatically
  $ growthub kit download growthub-open-higgsfield-studio-v1
  $ growthub kit inspect higgsfield-studio-v1
  $ growthub kit families                 # show family taxonomy
`);
  kit.action(async () => {
    await runInteractivePicker({});
  });
  kit.command("list").description("List all available kits grouped by type").option("--family <families>", "Filter by family (comma-separated: studio,workflow,operator,ops)").option("--json", "Output raw JSON for scripting").addHelpText("after", `
Examples:
  $ growthub kit list
  $ growthub kit list --family studio
  $ growthub kit list --family studio,operator
  $ growthub kit list --json
`).action((opts) => {
    let kits = listBundledKits();
    if (opts.family) {
      const wanted = opts.family.split(",").map((f) => f.trim().toLowerCase());
      kits = kits.filter((k) => wanted.includes(k.family));
      if (kits.length === 0) {
        console.error(pc26.yellow("No kits found for family: " + opts.family));
        console.error(pc26.dim("Valid families: studio, workflow, operator, ops"));
        process.exitCode = 1;
        return;
      }
    }
    if (opts.json) {
      console.log(JSON.stringify(kits, null, 2));
      return;
    }
    printGroupedList(kits);
  });
  kit.command("inspect").description("Inspect a kit manifest (supports fuzzy slug)").argument("<kit-id>", "Kit id or slug (e.g. 'higgsfield', 'studio-v1')").option("--out <path>", "Override the export root for resolved paths").option("--json", "Output raw JSON").addHelpText("after", `
Examples:
  $ growthub kit inspect higgsfield-studio-v1
  $ growthub kit inspect growthub-email-marketing-v1 --json
`).action((kitId, opts) => {
    const resolvedId = fuzzyResolveKitId(kitId);
    if (!resolvedId) {
      console.error(pc26.red("Unknown kit '" + kitId + "'.") + pc26.dim(" Run `growthub kit list` to browse."));
      process.exitCode = 1;
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify(inspectBundledKit(resolvedId, opts.out), null, 2));
      return;
    }
    runInspect(resolvedId, opts.out);
  });
  kit.command("download").description("Download a kit \u2014 interactive if no kit-id given").argument("[kit-id]", "Kit id or fuzzy slug (omit for interactive picker)").option("--out <path>", "Output directory for the generated artifacts").option("--yes", "Skip confirmation prompt").addHelpText("after", `
Examples:
  $ growthub kit download                           # interactive
  $ growthub kit download higgsfield                # fuzzy slug
  $ growthub kit download growthub-open-higgsfield-studio-v1
  $ growthub kit download studio-v1 --out ~/kits
  $ growthub kit download studio-v1 --yes
`).action(async (kitId, opts) => {
    if (!kitId) {
      await runInteractivePicker(opts);
      return;
    }
    const resolvedId = fuzzyResolveKitId(kitId);
    if (!resolvedId) {
      console.error(pc26.red("Unknown kit '" + kitId + "'.") + pc26.dim(" Run `growthub kit list` to browse."));
      process.exitCode = 1;
      return;
    }
    if (opts.yes) {
      const result = downloadBundledKit(resolvedId, opts.out, {
        onProgress: renderProgressBar
      });
      console.log("");
      console.log(pc26.bold("Exported folder:"), pc26.cyan(result.folderPath));
      console.log(pc26.bold("Open folder:   "), folderOpenLabel(result.folderPath));
      console.log(pc26.bold("Zip:           "), pc26.dim(result.zipPath));
      console.log("");
      console.log(pc26.bold("Next steps:"));
      console.log("  1. Point Working Directory at: " + pc26.cyan(result.folderPath));
      console.log("  2. " + pc26.cyan("cp .env.example .env") + "  \u2192  add your API key");
      console.log("  3. " + pc26.cyan("bash setup/clone-fork.sh") + "  \u2192  boot local studio");
      console.log("  4. Open Growthub local \u2014 the agent loads automatically");
      console.log("");
      return;
    }
    await runDownload(resolvedId, opts);
  });
  kit.command("path").description("Resolve the expected export folder path without exporting").argument("<kit-id>", "Kit id or fuzzy slug").option("--out <path>", "Override the export root").action((kitId, opts) => {
    const resolvedId = fuzzyResolveKitId(kitId);
    if (!resolvedId) {
      console.error(pc26.red("Unknown kit '" + kitId + "'."));
      process.exitCode = 1;
      return;
    }
    console.log(resolveKitPath(resolvedId, opts.out));
  });
  kit.command("validate").description("Validate a kit directory against the kit contract schema").argument("<path>", "Path to the kit directory").addHelpText("after", `
Examples:
  $ growthub kit validate ./my-kit
  $ growthub kit validate ~/kits/growthub-open-higgsfield-studio-v1
`).action((kitPath) => {
    const resolvedPath = path24.resolve(kitPath);
    const result = validateKitDirectory(resolvedPath);
    console.log("");
    console.log(pc26.bold("Kit: " + result.kitId) + pc26.dim("  schema v" + result.schemaVersion));
    console.log(hr());
    for (const w of result.warnings) {
      console.log(pc26.yellow("  WARN  " + w.field + ": " + w.message));
    }
    for (const e of result.errors) {
      console.log(pc26.red("  ERROR " + e.field + ": " + e.message));
    }
    if (result.errors.length > 0) {
      console.log("");
      console.log(pc26.red(pc26.bold("  Result: INVALID")) + pc26.dim("  (" + result.errors.length + " error" + (result.errors.length !== 1 ? "s" : "") + ")"));
      process.exitCode = 1;
    } else {
      console.log(pc26.green(pc26.bold("  Result: VALID")));
    }
    console.log("");
  });
  kit.command("families").description("Show the kit family taxonomy with descriptions and examples").action(() => {
    const defs = [
      { family: "studio", tagline: "AI generation studio backed by a local fork", surfaces: "local-fork, browser-hosted, desktop-app", example: "growthub-open-higgsfield-studio-v1, growthub-postiz-social-v1, growthub-zernio-social-v1" },
      { family: "workflow", tagline: "Multi-step pipeline operator across tools or APIs", surfaces: "browser-hosted (primary)", example: "creative-strategist-v1" },
      { family: "operator", tagline: "Domain vertical specialist \u2014 one provider, structured deliverables", surfaces: "browser-hosted", example: "growthub-email-marketing-v1" },
      { family: "ops", tagline: "Infrastructure / toolchain operator (provider optional)", surfaces: "local-fork (primary)", example: "(coming soon)" }
    ];
    console.log("");
    console.log(pc26.bold("Kit Family Taxonomy"));
    console.log(hr());
    for (const def of defs) {
      console.log("\n  " + typeBadge(def.family));
      console.log("  " + pc26.dim(def.tagline));
      console.log("  " + pc26.dim("Surfaces: ") + pc26.dim(def.surfaces));
      console.log("  " + pc26.dim("Example:  ") + pc26.cyan(def.example));
    }
    console.log("");
    console.log(hr());
    console.log(pc26.dim("  growthub kit list --family <family>  to filter by internal family"));
    console.log("");
  });
}

// src/commands/template.ts
import path26 from "node:path";
import * as p18 from "@clack/prompts";
import pc27 from "picocolors";

// src/templates/service.ts
import fs18 from "node:fs";
import path25 from "node:path";
import { fileURLToPath as fileURLToPath5 } from "node:url";

// src/templates/catalog.ts
var AD_FORMATS = [
  {
    type: "ad-format",
    slug: "bedroom-minimic-talk",
    id: "ad-formats/bedroom-minimic-talk",
    name: "Bedroom Mini-Mic Talk",
    family: "video-creative",
    category: "Skincare / Beauty Tech / Consumer Product",
    tags: ["ugc", "skincare", "beauty-tech", "tiktok", "23s", "proven"],
    scenes: 6,
    hookVariations: 5,
    compatibleFormats: [],
    frozen: true,
    path: "ad-formats/bedroom-minimic-talk.md"
  },
  {
    type: "ad-format",
    slug: "villain-animation",
    id: "ad-formats/villain-animation",
    name: "Villain Object Animation",
    family: "video-creative",
    category: "Pet / Home / Supplement / Displacement products",
    tags: ["animated", "villain", "long-form", "agitation-stack", "proven"],
    scenes: 9,
    hookVariations: 5,
    compatibleFormats: [],
    frozen: true,
    path: "ad-formats/villain-animation.md"
  },
  {
    type: "ad-format",
    slug: "process-specialist-medical",
    id: "ad-formats/process-specialist-medical",
    name: "The Process Specialist",
    family: "video-creative",
    category: "Medical / Regenerative Medicine / Healthcare Authority",
    tags: ["medical", "authority", "doctor", "ugc", "50s", "proven"],
    scenes: 5,
    hookVariations: 5,
    compatibleFormats: [],
    frozen: true,
    path: "ad-formats/process-specialist-medical.md"
  },
  {
    type: "ad-format",
    slug: "frame-analysis",
    id: "ad-formats/frame-analysis",
    name: "Frame-by-Frame Analysis Methodology",
    family: "video-creative",
    category: "Methodology \u2014 use when no frozen format matches a muse",
    tags: ["methodology", "muse", "frame-extraction"],
    scenes: null,
    hookVariations: null,
    compatibleFormats: [],
    frozen: true,
    path: "ad-formats/frame-analysis.md"
  }
];
var HOOKS = [
  {
    type: "scene-module",
    subtype: "hook",
    slug: "meme-overlay",
    id: "scene-modules/hooks/meme-overlay",
    name: "Meme Overlay Hook",
    family: "video-creative",
    category: "Relatable lifestyle pain \u2014 tired, stressed, broke",
    tags: ["meme", "scene-1", "scroll-stop", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["bedroom-minimic-talk"],
    path: "scene-modules/hooks/meme-overlay.md"
  },
  {
    type: "scene-module",
    subtype: "hook",
    slug: "tiktok-comment",
    id: "scene-modules/hooks/tiktok-comment",
    name: "TikTok Comment Hook",
    family: "video-creative",
    category: "High-skepticism categories \u2014 objection-first open",
    tags: ["tiktok-comment", "scene-1", "skepticism", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["bedroom-minimic-talk"],
    path: "scene-modules/hooks/tiktok-comment.md"
  },
  {
    type: "scene-module",
    subtype: "hook",
    slug: "pov-confession",
    id: "scene-modules/hooks/pov-confession",
    name: "POV Mirror Confession Hook",
    family: "video-creative",
    category: "Skincare / Beauty \u2014 female 25\u201335 demo",
    tags: ["pov", "mirror", "scene-1", "tiktok", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["bedroom-minimic-talk"],
    path: "scene-modules/hooks/pov-confession.md"
  },
  {
    type: "scene-module",
    subtype: "hook",
    slug: "dollar-amount",
    id: "scene-modules/hooks/dollar-amount",
    name: "Dollar Amount Confession Hook",
    family: "video-creative",
    category: "Any category where overspending is the shared pain",
    tags: ["dollar-amount", "scene-1", "cross-format", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["bedroom-minimic-talk", "villain-animation"],
    path: "scene-modules/hooks/dollar-amount.md"
  },
  {
    type: "scene-module",
    subtype: "hook",
    slug: "villain-hook",
    id: "scene-modules/hooks/villain-hook",
    name: "Villain Character Hook",
    family: "video-creative",
    category: "Animated \u2014 product displacing an incumbent",
    tags: ["villain", "animated", "scene-1", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["villain-animation"],
    path: "scene-modules/hooks/villain-hook.md"
  }
];
var BODY = [
  {
    type: "scene-module",
    subtype: "body",
    slug: "minimic-problem",
    id: "scene-modules/body/minimic-problem",
    name: "Mini-Mic Problem Confession",
    family: "video-creative",
    category: "Authority + failed solutions \u2014 Scene 2",
    tags: ["minimic", "scene-2", "authority", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["bedroom-minimic-talk"],
    path: "scene-modules/body/minimic-problem.md"
  },
  {
    type: "scene-module",
    subtype: "body",
    slug: "tiktok-skeptic-pivot",
    id: "scene-modules/body/tiktok-skeptic-pivot",
    name: "TikTok Skeptic Pivot",
    family: "video-creative",
    category: "Skeptic disarm + product intro \u2014 Scene 3",
    tags: ["tiktok-comment", "scene-3", "skeptic", "pivot", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["bedroom-minimic-talk"],
    path: "scene-modules/body/tiktok-skeptic-pivot.md"
  },
  {
    type: "scene-module",
    subtype: "body",
    slug: "product-demo-glow",
    id: "scene-modules/body/product-demo-glow",
    name: "Product Demo \u2014 Glow / Active Effect",
    family: "video-creative",
    category: "Products with a visible active state \u2014 Scene 4",
    tags: ["demo", "scene-4", "glow", "active-state", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["bedroom-minimic-talk"],
    path: "scene-modules/body/product-demo-glow.md"
  },
  {
    type: "scene-module",
    subtype: "body",
    slug: "villain-agitation",
    id: "scene-modules/body/villain-agitation",
    name: "Villain Agitation Stack",
    family: "video-creative",
    category: "4\xD7 stacked failed solutions \u2014 Scenes 2\u20135",
    tags: ["villain", "agitation", "scenes-2-5", "animated", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["villain-animation"],
    path: "scene-modules/body/villain-agitation.md"
  },
  {
    type: "scene-module",
    subtype: "body",
    slug: "before-after-flatlay",
    id: "scene-modules/body/before-after-flatlay",
    name: "Before/After + Product Flat Lay",
    family: "video-creative",
    category: "Social proof + product authority \u2014 Scene 5",
    tags: ["before-after", "flatlay", "scene-5", "social-proof", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["bedroom-minimic-talk"],
    path: "scene-modules/body/before-after-flatlay.md"
  }
];
var CTA = [
  {
    type: "scene-module",
    subtype: "cta",
    slug: "bogo-meme-bookend",
    id: "scene-modules/cta/bogo-meme-bookend",
    name: "BOGO + Meme Bookend Close",
    family: "video-creative",
    category: "BOGO / % off / flash offer \u2014 Scene 6",
    tags: ["bogo", "meme-bookend", "cta", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["bedroom-minimic-talk"],
    path: "scene-modules/cta/bogo-meme-bookend.md"
  },
  {
    type: "scene-module",
    subtype: "cta",
    slug: "guarantee-close",
    id: "scene-modules/cta/guarantee-close",
    name: "Guarantee Calendar Close",
    family: "video-creative",
    category: "30/60-day satisfaction guarantee \u2014 Scene 9",
    tags: ["guarantee", "calendar", "cta", "animated", "proven"],
    scenes: null,
    frozen: true,
    compatibleFormats: ["villain-animation"],
    path: "scene-modules/cta/guarantee-close.md"
  }
];
var TEMPLATE_CATALOG = [
  ...AD_FORMATS,
  ...HOOKS,
  ...BODY,
  ...CTA
  // ...EMAIL_TEMPLATES,
  // ...MOTION_TEMPLATES,
];

// src/templates/service.ts
function resolveSharedTemplatesRoot() {
  const moduleDir = path25.dirname(fileURLToPath5(import.meta.url));
  for (const candidate of [
    path25.resolve(moduleDir, "../../assets/shared-templates"),
    path25.resolve(moduleDir, "../assets/shared-templates")
  ]) {
    if (fs18.existsSync(candidate))
      return candidate;
  }
  throw new Error("Shared template assets not found at cli/assets/shared-templates/");
}
function resolveSlug(input) {
  const needle = input.toLowerCase().trim();
  return TEMPLATE_CATALOG.find((a) => a.id === needle) ?? TEMPLATE_CATALOG.find((a) => a.slug === needle) ?? TEMPLATE_CATALOG.find((a) => a.id.endsWith("/" + needle)) ?? TEMPLATE_CATALOG.find((a) => a.id.includes(needle) || a.slug.includes(needle)) ?? (() => {
    const tokens = needle.split(/[-_/\s]+/).filter((t) => t.length > 2);
    for (const token of tokens) {
      const match = TEMPLATE_CATALOG.find((a) => a.slug.includes(token) || a.id.includes(token));
      if (match)
        return match;
    }
    return null;
  })();
}
function listArtifacts(filter = {}) {
  let results = [...TEMPLATE_CATALOG];
  if (filter.type)
    results = results.filter((a) => a.type === filter.type);
  if (filter.subtype)
    results = results.filter((a) => a.type === "scene-module" && a.subtype === filter.subtype);
  if (filter.family)
    results = results.filter((a) => a.family === filter.family);
  if (filter.format) {
    const fmt = filter.format.toLowerCase();
    results = results.filter(
      (a) => a.compatibleFormats.length === 0 || a.compatibleFormats.some((f) => f.includes(fmt))
    );
  }
  if (filter.tags?.length) {
    results = results.filter((a) => filter.tags.some((tag) => a.tags.includes(tag)));
  }
  return results;
}
function getArtifact(slugOrId) {
  const artifact = resolveSlug(slugOrId);
  if (!artifact)
    throw new Error(`Unknown template '${slugOrId}'. Run 'growthub template list' to browse.`);
  const root = resolveSharedTemplatesRoot();
  const absolutePath = path25.resolve(root, artifact.path);
  if (!fs18.existsSync(absolutePath))
    throw new Error(`Template file missing: ${absolutePath}`);
  return { artifact, content: fs18.readFileSync(absolutePath, "utf8"), absolutePath };
}
function copyArtifact(slugOrId, destDir) {
  const resolved = getArtifact(slugOrId);
  fs18.mkdirSync(destDir, { recursive: true });
  const destPath = path25.resolve(destDir, path25.basename(resolved.absolutePath));
  fs18.copyFileSync(resolved.absolutePath, destPath);
  return destPath;
}
var GROUP_ORDER = ["ad-formats", "scene-modules/hooks", "scene-modules/body", "scene-modules/cta"];
var GROUP_META = {
  "ad-formats": { label: "Ad Formats", description: "Complete frozen video ad structures \u2014 scene count, sacred elements, adaptation rules" },
  "scene-modules/hooks": { label: "Scene Modules \u2014 Hooks", description: "Scene 1 \u2014 pattern interrupt, scroll stop, opening emotional beat" },
  "scene-modules/body": { label: "Scene Modules \u2014 Body", description: "Scenes 2\u2013N \u2014 problem confession, skeptic pivot, demo, social proof" },
  "scene-modules/cta": { label: "Scene Modules \u2014 CTA", description: "Final scene \u2014 offer close, guarantee, conversion" }
};
function groupKey(a) {
  if (a.type === "ad-format")
    return "ad-formats";
  return `scene-modules/${a.subtype}`;
}
function groupArtifacts(artifacts) {
  const map = /* @__PURE__ */ new Map();
  for (const a of artifacts) {
    const key = groupKey(a);
    if (!map.has(key))
      map.set(key, []);
    map.get(key).push(a);
  }
  const ordered = [];
  for (const key of GROUP_ORDER) {
    if (!map.has(key))
      continue;
    const items = map.get(key);
    const meta = GROUP_META[key] ?? { label: key, description: "" };
    ordered.push({ key, label: meta.label, description: meta.description, count: items.length, artifacts: items });
  }
  for (const [key, items] of map) {
    if (GROUP_ORDER.includes(key))
      continue;
    ordered.push({ key, label: key, description: "", count: items.length, artifacts: items });
  }
  return ordered;
}
function getCatalogStats() {
  const all = [...TEMPLATE_CATALOG];
  const byFamily = {};
  const byType = {};
  for (const a of all) {
    byFamily[a.family] = (byFamily[a.family] ?? 0) + 1;
    byType[a.type] = (byType[a.type] ?? 0) + 1;
  }
  return { total: all.length, byFamily, byType };
}

// src/commands/template.ts
function stripAnsi2(s) {
  return s.replace(/\x1B\[[0-9;]*m/g, "");
}
function hr2(w = 72) {
  return pc27.dim("\u2500".repeat(w));
}
function truncate2(s, max) {
  return s.length <= max ? s : s.slice(0, max - 1) + "\u2026";
}
function box2(lines) {
  const padded = lines.map((l) => "  " + l);
  const width = Math.max(...padded.map((l) => stripAnsi2(l).length)) + 4;
  const top = pc27.dim("\u250C" + "\u2500".repeat(width) + "\u2510");
  const bottom = pc27.dim("\u2514" + "\u2500".repeat(width) + "\u2518");
  const body = padded.map((l) => pc27.dim("\u2502") + l + " ".repeat(width - stripAnsi2(l).length) + pc27.dim("\u2502"));
  return [top, ...body, bottom].join("\n");
}
function badge(a) {
  if (a.type === "ad-format")
    return pc27.cyan("\u{1F3AC} Ad Format");
  if (a.type === "scene-module") {
    if (a.subtype === "hook")
      return pc27.yellow("\u{1FA9D} Hook");
    if (a.subtype === "body")
      return pc27.blue("\u{1F9E9} Body");
    if (a.subtype === "cta")
      return pc27.green("\u{1F3AF} CTA");
  }
  return pc27.magenta("\u{1F9E9} Module");
}
function printCard(a) {
  const compat = a.compatibleFormats.length ? pc27.dim("Works with: ") + a.compatibleFormats.map((f) => pc27.cyan(f)).join(", ") : pc27.dim("Works with: any format");
  const rows = [
    pc27.bold(a.name),
    `${badge(a)}  ${pc27.dim(a.id)}`,
    "",
    truncate2(a.category, 62),
    "",
    compat
  ];
  if (a.type === "ad-format" && a.scenes != null) {
    rows.push(pc27.dim("Scenes: ") + a.scenes + (a.hookVariations ? pc27.dim("  \xB7 Hook variations: ") + a.hookVariations : ""));
  }
  console.log("");
  console.log(box2(rows));
}
function printSummary2(filter) {
  const artifacts = listArtifacts(filter);
  if (!artifacts.length) {
    console.log(pc27.yellow("No templates matched. Try: growthub template list"));
    return;
  }
  const stats = getCatalogStats();
  const groups = groupArtifacts(artifacts);
  console.log("");
  console.log(pc27.bold("Growthub Shared Template Library") + pc27.dim(`  ${artifacts.length} of ${stats.total} artifacts`));
  console.log(pc27.dim("  " + Object.entries(stats.byFamily).map(([f, n]) => `${f} (${n})`).join(" \xB7 ")));
  console.log(hr2());
  for (const g of groups) {
    console.log(`
${pc27.bold(g.label)}  ${pc27.dim("(" + g.count + ")")}`);
    console.log(pc27.dim("  " + g.description));
    console.log("");
    for (const a of g.artifacts) {
      const compat = a.compatibleFormats.length ? pc27.dim(" \xB7 " + a.compatibleFormats.join(", ")) : "";
      console.log(`  ${pc27.cyan(pc27.bold(a.name))}${compat}`);
      console.log(`  ${pc27.dim("growthub template get " + a.slug)}`);
      console.log("");
    }
  }
  console.log(hr2());
  console.log(pc27.dim("  growthub template get <slug>"));
  console.log(pc27.dim("  growthub template list --type ad-formats"));
  console.log(pc27.dim("  growthub template list --type scene-modules --subtype hooks"));
  console.log(pc27.dim("  growthub template   (interactive picker)"));
  console.log("");
}
var TEMPLATE_FAMILY_META = {
  "video-creative": {
    label: "Video Ads",
    emoji: "\u{1F3AC}",
    hint: "Ad formats, hooks, body modules, and CTA modules"
  },
  email: {
    label: "Email",
    emoji: "\u2709\uFE0F",
    hint: "Email-native templates"
  },
  motion: {
    label: "Motion",
    emoji: "\u{1F39E}\uFE0F",
    hint: "Motion and animation artifacts"
  },
  general: {
    label: "General",
    emoji: "\u{1F9E9}",
    hint: "Shared general-purpose templates"
  }
};
async function runTemplatePicker(opts) {
  p18.intro(pc27.bold("Growthub Shared Template Library"));
  let artifacts;
  try {
    artifacts = listArtifacts();
  } catch (err) {
    p18.log.error(err.message);
    process.exit(1);
  }
  const families = [...new Set(artifacts.map((artifact) => artifact.family))];
  const familyChoice = await p18.select({
    message: "What template type do you want to browse?",
    options: [
      ...families.map((family) => {
        const meta = TEMPLATE_FAMILY_META[family] ?? {
          label: family,
          emoji: "\u{1F9E9}",
          hint: `${family} templates`
        };
        const familyCount = artifacts.filter((artifact) => artifact.family === family).length;
        return {
          value: family,
          label: `${meta.emoji} ${meta.label}`,
          hint: `${familyCount} available \xB7 ${meta.hint}`
        };
      }),
      ...opts?.allowBackToHub ? [{ value: "__back_to_hub", label: "\u2190 Back to main menu" }] : []
    ]
  });
  if (p18.isCancel(familyChoice)) {
    p18.cancel("Cancelled.");
    process.exit(0);
  }
  if (familyChoice === "__back_to_hub")
    return "back";
  const filteredArtifacts = artifacts.filter((artifact) => artifact.family === familyChoice);
  const groups = groupArtifacts(filteredArtifacts);
  const groupChoice = await p18.select({
    message: "What kind of template?",
    options: groups.map((g) => ({
      value: g.key,
      label: g.label,
      hint: `${g.count} available \xB7 ${g.description}`
    }))
  });
  if (p18.isCancel(groupChoice)) {
    p18.cancel("Cancelled.");
    process.exit(0);
  }
  const group = groups.find((g) => g.key === groupChoice);
  const artifactChoice = await p18.select({
    message: `Select from: ${group.label}`,
    options: group.artifacts.map((a) => ({
      value: a.id,
      label: pc27.bold(a.name),
      hint: truncate2(a.category, 52)
    }))
  });
  if (p18.isCancel(artifactChoice)) {
    p18.cancel("Cancelled.");
    process.exit(0);
  }
  const selected = filteredArtifacts.find((a) => a.id === artifactChoice);
  printCard(selected);
  const action = await p18.select({
    message: "What would you like to do?",
    options: [
      { value: "print", label: "\u{1F4C4} Print to terminal" },
      { value: "copy", label: "\u{1F4C1} Copy to directory" },
      { value: "slug", label: "\u{1F4CB} Print slug" },
      { value: "cancel", label: "Cancel" }
    ]
  });
  if (p18.isCancel(action) || action === "cancel") {
    p18.cancel("Cancelled.");
    process.exit(0);
  }
  if (action === "slug") {
    console.log(selected.slug);
    p18.outro(pc27.dim("Use with: growthub template get " + selected.slug));
    return "done";
  }
  if (action === "print") {
    const r = getArtifact(selected.id);
    console.log("\n" + hr2());
    console.log(r.content);
    console.log(hr2());
    p18.outro(pc27.dim("Source: " + r.absolutePath));
    return "done";
  }
  if (action === "copy") {
    const destInput = await p18.text({
      message: "Output directory:",
      placeholder: "~/Downloads/templates",
      validate: (v) => !v?.trim() ? "Path is required" : void 0
    });
    if (p18.isCancel(destInput)) {
      p18.cancel("Cancelled.");
      process.exit(0);
    }
    const destDir = path26.resolve(destInput.replace(/^~/, process.env["HOME"] ?? ""));
    const destPath = copyArtifact(selected.id, destDir);
    p18.outro(pc27.green("Copied \u2192 ") + destPath);
    return "done";
  }
  return "done";
}
function registerTemplateCommands(program2) {
  const cmd = program2.command("template").description("Browse and pull from the shared creative template library").addHelpText("after", `
Shared templates are frozen artifact primitives \u2014 distinct from kits.
Any agent or kit resolves them by slug.

  $ growthub template                                     Interactive picker
  $ growthub template list                                Grouped summary
  $ growthub template list --type ad-formats
  $ growthub template list --type scene-modules --subtype hooks
  $ growthub template list --format villain-animation
  $ growthub template get villain-animation               Fuzzy slug
  $ growthub template get meme-overlay --out ~/kit/hooks/
  $ growthub template get villain-animation --json
`);
  cmd.action(async () => {
    await runTemplatePicker();
  });
  cmd.command("list").description("Grouped template summary \u2014 filter before browsing").option("--type <type>", "ad-formats | scene-modules").option("--subtype <subtype>", "hooks | body | cta  (scene-modules only)").option("--format <format>", "Filter by compatible ad format slug").option("--json", "Raw JSON for scripting").action((opts) => {
    const filter = {};
    if (opts.type) {
      const t = opts.type.replace(/s$/, "");
      if (t !== "ad-format" && t !== "scene-module") {
        console.error(pc27.red(`Unknown --type '${opts.type}'.`) + pc27.dim(" Valid: ad-formats, scene-modules"));
        process.exitCode = 1;
        return;
      }
      filter.type = t;
    }
    if (opts.subtype) {
      const sub = opts.subtype.replace(/s$/, "");
      if (!["hook", "body", "cta"].includes(sub)) {
        console.error(pc27.red(`Unknown --subtype '${opts.subtype}'.`) + pc27.dim(" Valid: hooks, body, cta"));
        process.exitCode = 1;
        return;
      }
      filter.subtype = sub;
    }
    if (opts.format)
      filter.format = opts.format;
    if (opts.json) {
      console.log(JSON.stringify(listArtifacts(filter), null, 2));
      return;
    }
    printSummary2(filter);
  });
  cmd.command("get").description("Print or copy a template \u2014 fuzzy slug resolution").argument("<slug>", "Artifact slug (e.g. villain-animation, meme-overlay)").option("--out <path>", "Copy to this directory").option("--json", "Artifact metadata + content as JSON").action((slug, opts) => {
    const artifact = resolveSlug(slug);
    if (!artifact) {
      console.error(pc27.red(`Unknown template '${slug}'.`) + pc27.dim(" Run `growthub template list` to browse."));
      process.exitCode = 1;
      return;
    }
    if (artifact.id !== slug && artifact.slug !== slug) {
      console.error(pc27.dim(`Resolved '${slug}' \u2192 ${artifact.slug}`));
    }
    let resolved;
    try {
      resolved = getArtifact(artifact.id);
    } catch (err) {
      console.error(pc27.red(err.message));
      process.exitCode = 1;
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify({ artifact: resolved.artifact, content: resolved.content }, null, 2));
      return;
    }
    if (opts.out) {
      const destDir = path26.resolve(opts.out.replace(/^~/, process.env["HOME"] ?? ""));
      try {
        const dest = copyArtifact(artifact.id, destDir);
        console.log(pc27.green("Copied \u2192 ") + dest);
      } catch (err) {
        console.error(pc27.red(err.message));
        process.exitCode = 1;
      }
      return;
    }
    printCard(resolved.artifact);
    console.log(hr2());
    console.log(resolved.content);
    console.log(hr2());
    console.log(pc27.dim("Source: " + resolved.absolutePath));
    console.log("");
  });
}

// src/commands/capability.ts
import * as p19 from "@clack/prompts";
import pc28 from "picocolors";

// src/runtime/hosted-execution-client/index.ts
import { randomUUID } from "node:crypto";
var EXECUTE_PATH = "/api/execute-workflow";
var THREAD_BIND_PATH = "/api/projects/threads/bind";
var PROVIDER_REPORT_PATH = "/api/sandbox/provider-report";
var PROFILE_PATH = "/api/cli/profile";
var CAPABILITIES_PATH = "/api/cli/capabilities";
var HostedExecutionError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var NoActiveSessionError = class extends Error {
  constructor() {
    super(
      "No active hosted session. Run `growthub auth login` to authenticate."
    );
  }
};
function requireSession() {
  const session = readSession();
  if (!session)
    throw new NoActiveSessionError();
  if (isSessionExpired(session)) {
    throw new HostedExecutionError(
      401,
      "Hosted session expired. Run `growthub auth login` to re-authenticate."
    );
  }
  return session;
}
function clientFromSession(session) {
  return new PaperclipApiClient({
    apiBase: session.hostedBaseUrl,
    apiKey: session.accessToken,
    userId: session.userId
  });
}
function isUnavailable(err) {
  return err instanceof ApiRequestError && (err.status === 404 || err.status === 501);
}
function isPlaceholderString(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized)
    return true;
  return normalized.startsWith("enter ") || normalized.startsWith("select ") || normalized === "placeholder";
}
function sanitizeBindingValue(value) {
  if (typeof value === "string") {
    return isPlaceholderString(value) ? "" : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeBindingValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeBindingValue(entry)])
    );
  }
  return value;
}
function sanitizeBindings(bindings) {
  return Object.fromEntries(
    Object.entries(bindings).map(([key, value]) => [key, sanitizeBindingValue(value)])
  );
}
async function buildExecutionGraph(input, session) {
  const workflowId = input.workflowId?.trim() || input.threadId?.trim() || input.pipelineId;
  const threadId = await resolveExecutionThreadId(input, session, workflowId);
  const userId = session.userId?.trim();
  if (!userId) {
    throw new HostedExecutionError(401, "Hosted session is missing the authenticated user id.");
  }
  const cmsNodes = input.nodes.map((node, index51) => ({
    id: node.nodeId,
    type: "cmsNode",
    position: { x: (index51 + 1) * 300, y: 0 },
    data: {
      slug: node.slug,
      inputs: sanitizeBindings(node.bindings)
    }
  }));
  const nodes = [
    { id: "start-1", type: "start", position: { x: 0, y: 0 }, data: {} },
    ...cmsNodes,
    {
      id: "end-1",
      type: "end",
      position: { x: (cmsNodes.length + 1) * 300, y: 0 },
      data: {}
    }
  ];
  const edges = [];
  for (const node of input.nodes) {
    const upstreamNodeIds = node.upstreamNodeIds ?? [];
    if (upstreamNodeIds.length === 0) {
      edges.push({
        id: `e-start-1-${node.nodeId}`,
        source: "start-1",
        target: node.nodeId
      });
      continue;
    }
    for (const upstreamNodeId of upstreamNodeIds) {
      edges.push({
        id: `e-${upstreamNodeId}-${node.nodeId}`,
        source: upstreamNodeId,
        target: node.nodeId
      });
    }
  }
  const upstreamSources = new Set(
    input.nodes.flatMap((node) => node.upstreamNodeIds ?? [])
  );
  for (const node of input.nodes) {
    if (!upstreamSources.has(node.nodeId)) {
      edges.push({
        id: `e-${node.nodeId}-end-1`,
        source: node.nodeId,
        target: "end-1"
      });
    }
  }
  const userPrompt = inferUserPrompt(input);
  return {
    nodes,
    edges,
    userId,
    workflowId,
    threadId,
    ...userPrompt ? { userPrompt } : {}
  };
}
async function resolveExecutionThreadId(input, session, workflowId) {
  const candidate = input.threadId?.trim();
  if (candidate) {
    if (!isUuid(candidate)) {
      throw new HostedExecutionError(
        400,
        `Invalid thread id "${candidate}". Hosted workflow execution requires a real UUID thread id.`
      );
    }
    return candidate;
  }
  if (isUuid(workflowId)) {
    return workflowId;
  }
  return await createHostedThread(session);
}
function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
async function createHostedThread(session) {
  const userId = session.userId?.trim();
  if (!userId) {
    throw new HostedExecutionError(401, "Hosted session is missing the authenticated user id.");
  }
  const threadId = randomUUID();
  const response = await fetch(new URL(THREAD_BIND_PATH, `${session.hostedBaseUrl.replace(/\/+$/, "")}/`).toString(), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
      "x-user-id": userId
    },
    body: JSON.stringify({ threadId })
  });
  if (!response.ok) {
    throw await toHostedExecutionError(response);
  }
  return threadId;
}
function inferUserPrompt(input) {
  if (typeof input.userPrompt === "string" && input.userPrompt.trim().length > 0) {
    return input.userPrompt.trim();
  }
  const promptKeys = ["prompt", "userPrompt", "query", "instruction", "instructions"];
  for (const node of input.nodes) {
    for (const key of promptKeys) {
      const promptValue = node.bindings[key];
      if (typeof promptValue === "string" && promptValue.trim().length > 0 && !isPlaceholderString(promptValue)) {
        return promptValue.trim();
      }
    }
  }
  return void 0;
}
function safeParseJson2(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
async function executeWorkflowStream(request, session, opts) {
  const response = await fetch(new URL(EXECUTE_PATH, `${session.hostedBaseUrl.replace(/\/+$/, "")}/`).toString(), {
    method: "POST",
    headers: {
      accept: "text/plain",
      "content-type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
      "x-user-id": request.userId
    },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw await toHostedExecutionError(response);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new HostedExecutionError(502, "Hosted workflow endpoint returned no stream body.");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let executionId = request.workflowId;
  let executionLog = null;
  const nodeResults = /* @__PURE__ */ new Map();
  while (true) {
    const { value, done } = await reader.read();
    if (done)
      break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const event = safeParseJson2(line);
        if (event) {
          await opts?.onEvent?.(event);
          applyWorkflowEvent(event, nodeResults, request);
          if (typeof event.executionId === "string" && event.executionId.trim()) {
            executionId = event.executionId;
          }
          if (event.type === "complete" && Array.isArray(event.executionLog)) {
            executionLog = event.executionLog;
          }
          if (event.type === "error") {
            throw new HostedExecutionError(500, event.error || "Workflow execution failed.");
          }
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }
  const trailing = buffer.trim();
  if (trailing) {
    const event = safeParseJson2(trailing);
    if (event) {
      await opts?.onEvent?.(event);
      applyWorkflowEvent(event, nodeResults, request);
      if (typeof event.executionId === "string" && event.executionId.trim()) {
        executionId = event.executionId;
      }
      if (event.type === "complete" && Array.isArray(event.executionLog)) {
        executionLog = event.executionLog;
      }
      if (event.type === "error") {
        throw new HostedExecutionError(500, event.error || "Workflow execution failed.");
      }
    }
  }
  if (!executionLog) {
    throw new HostedExecutionError(502, "Workflow stream ended without a completion event.");
  }
  const artifacts = collectArtifacts(executionLog);
  const summary = summarizeExecution(executionLog);
  const status = executionLog.some((entry) => typeof entry.error === "string" && entry.error.length > 0) ? "failed" : "succeeded";
  return {
    executionId,
    threadId: request.threadId,
    status,
    nodeResults: Object.fromEntries(nodeResults.entries()),
    artifacts,
    executionLog,
    summary
  };
}
function applyWorkflowEvent(event, nodeResults, request) {
  if (!event.nodeId)
    return;
  const current = nodeResults.get(event.nodeId);
  const next = current ?? {
    nodeId: event.nodeId,
    slug: resolveNodeSlug(request, event.nodeId),
    status: "pending"
  };
  if (event.type === "node_start") {
    next.status = "running";
  } else if (event.type === "node_complete") {
    next.status = "succeeded";
    next.output = event.output;
  } else if (event.type === "node_error") {
    next.status = "failed";
    next.error = event.error;
  }
  nodeResults.set(event.nodeId, next);
}
function collectArtifacts(executionLog) {
  const artifacts = [];
  for (const entry of executionLog) {
    if (entry.type !== "cmsNode" || typeof entry.nodeId !== "string")
      continue;
    const output = entry.output;
    if (typeof output !== "object" || output === null)
      continue;
    const record = output;
    const images = Array.isArray(record.images) ? record.images : [];
    for (const image of images) {
      if (!image || typeof image !== "object")
        continue;
      const imageRecord = image;
      const storagePath = typeof imageRecord.storage_path === "string" ? imageRecord.storage_path : void 0;
      artifacts.push({
        artifactId: storagePath ?? `${entry.nodeId}-image-${artifacts.length + 1}`,
        artifactType: "image",
        nodeId: entry.nodeId,
        url: typeof imageRecord.url === "string" ? imageRecord.url : void 0,
        storagePath,
        metadata: imageRecord
      });
    }
    const slides = Array.isArray(record.slides) ? record.slides : [];
    for (const slide of slides) {
      if (!slide || typeof slide !== "object")
        continue;
      const slideRecord = slide;
      const storagePath = typeof slideRecord.storage_path === "string" ? slideRecord.storage_path : void 0;
      artifacts.push({
        artifactId: storagePath ?? `${entry.nodeId}-slide-${artifacts.length + 1}`,
        artifactType: "slides",
        nodeId: entry.nodeId,
        url: typeof slideRecord.url === "string" ? slideRecord.url : void 0,
        storagePath,
        metadata: slideRecord
      });
    }
  }
  return artifacts;
}
function resolveNodeSlug(request, nodeId) {
  const match = request.nodes.find((node) => node.id === nodeId);
  if (!match || typeof match.data !== "object" || match.data === null) {
    return nodeId;
  }
  const slug = match.data.slug;
  return typeof slug === "string" && slug.trim().length > 0 ? slug : nodeId;
}
function summarizeExecution(executionLog) {
  let outputText;
  let imageCount = 0;
  let slideCount = 0;
  let videoCount = 0;
  let workflowRunId;
  for (const entry of executionLog) {
    if (!workflowRunId && typeof entry.workflowRunId === "string") {
      workflowRunId = entry.workflowRunId;
    }
    const output = entry.output;
    if (typeof output !== "object" || output === null)
      continue;
    const record = output;
    if (!outputText && typeof record.text === "string" && record.text.trim().length > 0) {
      outputText = record.text.trim();
    }
    if (Array.isArray(record.images))
      imageCount += record.images.length;
    if (Array.isArray(record.slides))
      slideCount += record.slides.length;
    if (Array.isArray(record.videos))
      videoCount += record.videos.length;
  }
  return {
    ...outputText ? { outputText } : {},
    ...imageCount > 0 ? { imageCount } : {},
    ...slideCount > 0 ? { slideCount } : {},
    ...videoCount > 0 ? { videoCount } : {},
    ...workflowRunId ? { workflowRunId } : {},
    keyboardShortcutHint: "Open the full run in Growthub if you want the expanded UI view."
  };
}
async function toHostedExecutionError(response) {
  let message = `Request failed with status ${response.status}`;
  try {
    const text63 = await response.text();
    if (text63.trim()) {
      const parsed = JSON.parse(text63);
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        message = parsed.error;
      } else if (typeof parsed.message === "string" && parsed.message.trim()) {
        message = parsed.message;
      } else {
        message = text63;
      }
    }
  } catch {
  }
  return new HostedExecutionError(response.status, message);
}
function createHostedExecutionClient() {
  return {
    async executeWorkflow(input, opts) {
      const session = requireSession();
      try {
        const request = await buildExecutionGraph(input, session);
        return await executeWorkflowStream(request, session, opts);
      } catch (err) {
        if (isUnavailable(err)) {
          throw new HostedExecutionError(
            err.status,
            "Hosted execution endpoint is not available. Ensure the hosted app supports /api/execute-workflow."
          );
        }
        throw err;
      }
    },
    async runProviderAssembly(input) {
      const session = requireSession();
      const client = clientFromSession(session);
      try {
        const result = await client.post(PROVIDER_REPORT_PATH, input);
        if (!result) {
          throw new HostedExecutionError(502, "Empty response from provider assembly endpoint.");
        }
        return result;
      } catch (err) {
        if (isUnavailable(err)) {
          throw new HostedExecutionError(
            err.status,
            "Provider assembly endpoint is not available. Ensure the hosted app supports /api/sandbox/provider-report."
          );
        }
        throw err;
      }
    },
    async getHostedProfile() {
      const session = requireSession();
      const client = clientFromSession(session);
      try {
        const result = await client.get(PROFILE_PATH);
        if (!result) {
          const overlay = readHostedOverlay();
          if (overlay) {
            return {
              userId: overlay.userId ?? "",
              email: overlay.email,
              displayName: overlay.displayName,
              orgId: overlay.orgId,
              orgName: overlay.orgName,
              entitlements: overlay.entitlements,
              gatedKitSlugs: overlay.gatedKitSlugs,
              executionDefaults: overlay.executionDefaults
            };
          }
          throw new HostedExecutionError(502, "No hosted profile available and no local overlay cached.");
        }
        return result;
      } catch (err) {
        if (isUnavailable(err)) {
          const overlay = readHostedOverlay();
          if (overlay) {
            return {
              userId: overlay.userId ?? "",
              email: overlay.email,
              displayName: overlay.displayName,
              orgId: overlay.orgId,
              orgName: overlay.orgName,
              entitlements: overlay.entitlements,
              gatedKitSlugs: overlay.gatedKitSlugs,
              executionDefaults: overlay.executionDefaults
            };
          }
          throw new HostedExecutionError(
            err.status,
            "Hosted profile endpoint not available and no local overlay cached."
          );
        }
        throw err;
      }
    },
    async getHostedCapabilities() {
      const session = requireSession();
      const client = clientFromSession(session);
      try {
        const result = await client.get(CAPABILITIES_PATH);
        return result ?? [];
      } catch (err) {
        if (isUnavailable(err)) {
          return [];
        }
        throw err;
      }
    }
  };
}

// src/runtime/cms-capability-registry/types.ts
var CAPABILITY_FAMILIES = [
  "video",
  "image",
  "slides",
  "text",
  "data",
  "ops",
  "research",
  "vision"
];

// src/runtime/cms-capability-registry/index.ts
function toCapabilityNode(record) {
  const familyMap = {
    video: "video",
    image: "image",
    slides: "slides",
    text: "text",
    data: "data",
    ops: "ops",
    research: "research",
    vision: "vision"
  };
  const metadata = record.metadata ?? {};
  const executionTokens = metadata.executionTokens ?? metadata.execution_tokens ?? {};
  const inputTemplate = executionTokens.input_template ?? metadata.input_template ?? {};
  const outputMapping = executionTokens.output_mapping ?? metadata.output_mapping ?? {};
  const toolName = typeof executionTokens.tool_name === "string" ? executionTokens.tool_name : typeof metadata.tool_name === "string" ? metadata.tool_name : record.slug;
  const executionStrategy = typeof (metadata.executionStrategy ?? metadata.execution_strategy) === "string" ? metadata.executionStrategy ?? metadata.execution_strategy : "direct";
  return {
    slug: record.slug,
    displayName: record.displayName,
    icon: typeof metadata.icon === "string" ? metadata.icon : "",
    family: familyMap[record.family] ?? "ops",
    category: typeof metadata.category === "string" ? metadata.category : "automation",
    nodeType: typeof metadata.nodeType === "string" ? metadata.nodeType : "tool_execution",
    executionKind: record.executionKind,
    executionBinding: { type: "mcp_tool_call", strategy: executionStrategy },
    executionTokens: {
      tool_name: toolName,
      input_template: inputTemplate,
      output_mapping: outputMapping
    },
    requiredBindings: record.requiredBindings,
    outputTypes: record.outputTypes,
    enabled: record.enabled,
    experimental: Boolean(metadata.experimental),
    visibility: typeof metadata.visibility === "string" ? metadata.visibility : "authenticated",
    description: typeof metadata.description === "string" ? metadata.description : void 0,
    manifestMetadata: metadata
  };
}
function inferFamilyFromSlug(slug) {
  const normalized = slug.toLowerCase();
  if (normalized.includes("video"))
    return "video";
  if (normalized.includes("image"))
    return "image";
  if (normalized.includes("slide"))
    return "slides";
  if (normalized.includes("research"))
    return "research";
  if (normalized.includes("vision"))
    return "vision";
  if (normalized.includes("text") || normalized.includes("llm"))
    return "text";
  if (normalized.includes("data"))
    return "data";
  return "ops";
}
async function deriveCapabilitiesFromHostedWorkflows() {
  const session = readSession();
  if (!session || isSessionExpired(session))
    return [];
  const list = await listHostedWorkflows(session);
  const workflows = list?.workflows ?? [];
  if (workflows.length === 0)
    return [];
  const bySlug = /* @__PURE__ */ new Map();
  for (const workflow of workflows.slice(0, 50)) {
    const detail = await fetchHostedWorkflow(session, workflow.workflowId);
    const nodes = Array.isArray(detail?.latestVersion?.config?.nodes) ? detail?.latestVersion?.config?.nodes : [];
    for (const node of nodes) {
      if (node.type !== "cmsNode")
        continue;
      const data = node.data ?? {};
      const slug = typeof data.slug === "string" ? data.slug : null;
      if (!slug)
        continue;
      const inputs = data.inputs ?? {};
      if (!bySlug.has(slug)) {
        bySlug.set(slug, {
          slug,
          family: inferFamilyFromSlug(slug),
          displayName: slug,
          executionKind: "hosted-execute",
          requiredBindings: [],
          outputTypes: [],
          enabled: true,
          metadata: {
            input_template: inputs,
            output_mapping: {},
            tool_name: slug,
            source: "derived-from-hosted-workflows"
          }
        });
      }
    }
  }
  return [...bySlug.values()];
}
function matchesQuery(node, query) {
  if (query.enabledOnly !== false && !node.enabled)
    return false;
  if (query.family && node.family !== query.family)
    return false;
  if (query.executionKind && node.executionKind !== query.executionKind)
    return false;
  if (query.outputType && !node.outputTypes.includes(query.outputType))
    return false;
  if (query.slug && !node.slug.includes(query.slug))
    return false;
  if (query.search) {
    const term = query.search.toLowerCase();
    const haystack = `${node.slug} ${node.displayName} ${node.description ?? ""} ${node.category}`.toLowerCase();
    if (!haystack.includes(term))
      return false;
  }
  return true;
}
function createCmsCapabilityRegistryClient() {
  return {
    async listCapabilities(query) {
      const executionClient = createHostedExecutionClient();
      let hostedRecords = await executionClient.getHostedCapabilities();
      if (hostedRecords.length === 0) {
        hostedRecords = await deriveCapabilitiesFromHostedWorkflows();
      }
      if (hostedRecords.length === 0) {
        throw new Error("Hosted capability registry returned zero nodes. No local fallback is enabled.");
      }
      const nodes = hostedRecords.map(toCapabilityNode);
      const enabledCount = nodes.filter((n) => n.enabled).length;
      const filtered = query ? nodes.filter((n) => matchesQuery(n, query)) : nodes;
      return {
        nodes: filtered,
        meta: {
          total: nodes.length,
          enabledCount,
          fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
          source: "hosted"
        }
      };
    },
    async getCapability(slug) {
      const { nodes } = await this.listCapabilities({ slug, enabledOnly: false });
      return nodes.find((n) => n.slug === slug) ?? null;
    }
  };
}

// src/runtime/machine-capability-resolver/index.ts
import os6 from "node:os";
function buildMachineContext(profile) {
  return {
    hostname: os6.hostname(),
    machineLabel: profile.local.machineLabel ?? void 0,
    workspaceLabel: profile.local.workspaceLabel ?? void 0,
    instanceId: profile.local.instanceId,
    hasActiveSession: profile.authenticated
  };
}
function resolveBinding(capability, profile) {
  const binding = {
    capabilitySlug: capability.slug,
    allowed: false,
    requiredConnectionCapabilities: capability.requiredBindings
  };
  if (!profile.authenticated) {
    binding.reason = "No active hosted session. Run `growthub auth login`.";
    return binding;
  }
  if (!capability.enabled) {
    binding.reason = `Capability "${capability.slug}" is disabled for this user/org.`;
    return binding;
  }
  if (capability.executionKind === "local-only") {
    binding.allowed = true;
    binding.reason = "Local-only execution \u2014 no hosted connection required.";
    return binding;
  }
  const entitlements = new Set(profile.hosted.entitlements);
  const missingEntitlements = [];
  for (const req of capability.requiredBindings) {
    const hasEntitlement = entitlements.has(req) || entitlements.has(`capability:${capability.slug}`) || entitlements.has("capability:*");
    if (!hasEntitlement) {
      missingEntitlements.push(req);
    }
  }
  if (capability.executionKind === "hosted-execute") {
    const canUseHosted = profile.executionDefaults.preferredMode !== "local" || profile.executionDefaults.allowBrowserBridge;
    if (!canUseHosted && missingEntitlements.length > 0) {
      binding.reason = `Hosted execution required but execution defaults prefer local. Missing bindings: ${missingEntitlements.join(", ")}.`;
      return binding;
    }
  }
  if (profile.hosted.entitlements.length === 0) {
    binding.allowed = true;
    binding.reason = "No entitlement restrictions configured \u2014 allowed by default.";
    binding.machineConnectionId = profile.local.instanceId;
    return binding;
  }
  if (missingEntitlements.length > 0) {
    binding.reason = `Missing entitlements for required bindings: ${missingEntitlements.join(", ")}.`;
    return binding;
  }
  binding.allowed = true;
  binding.machineConnectionId = profile.local.instanceId;
  binding.reason = "All binding requirements satisfied.";
  return binding;
}
function createMachineCapabilityResolver() {
  return {
    async resolveAll() {
      const profile = computeEffectiveProfile();
      const machineContext = buildMachineContext(profile);
      const registry = createCmsCapabilityRegistryClient();
      const { nodes } = await registry.listCapabilities({ enabledOnly: false });
      const bindings = nodes.map((capability) => resolveBinding(capability, profile));
      return {
        bindings,
        machineContext,
        entitlements: profile.hosted.entitlements,
        resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    },
    async resolveCapability(slug) {
      const profile = computeEffectiveProfile();
      const registry = createCmsCapabilityRegistryClient();
      const capability = await registry.getCapability(slug);
      if (!capability)
        return null;
      return resolveBinding(capability, profile);
    },
    getMachineContext() {
      const profile = computeEffectiveProfile();
      return buildMachineContext(profile);
    }
  };
}

// src/auth/workflow-access.ts
function getWorkflowAccess() {
  const profile = computeEffectiveProfile();
  if (!profile.authenticated) {
    return {
      state: "unauthenticated",
      reason: "Requires growthub auth login"
    };
  }
  if (!profile.hosted.present || !profile.hosted.linkedInstanceId) {
    return {
      state: "unlinked",
      reason: "Requires Growthub Local Machine connection"
    };
  }
  if (profile.hosted.linkedInstanceId !== profile.local.instanceId) {
    return {
      state: "unlinked",
      reason: `Linked to ${profile.hosted.linkedInstanceId}, not this workspace`
    };
  }
  return {
    state: "ready",
    reason: "Workflow tools unlocked"
  };
}

// src/commands/capability.ts
init_banner();
var FAMILY_CONFIG = {
  video: { color: pc28.magenta, emoji: "\u{1F3AC}", label: "Video" },
  image: { color: pc28.cyan, emoji: "\u{1F5BC}\uFE0F ", label: "Image" },
  slides: { color: pc28.yellow, emoji: "\u{1F4CA}", label: "Slides" },
  text: { color: pc28.green, emoji: "\u{1F4DD}", label: "Text" },
  data: { color: pc28.blue, emoji: "\u{1F4E6}", label: "Data" },
  ops: { color: pc28.red, emoji: "\u2699\uFE0F ", label: "Ops" }
};
function familyBadge(family) {
  const cfg = FAMILY_CONFIG[family];
  if (!cfg)
    return family;
  return cfg.color(`${cfg.emoji} ${cfg.label}`);
}
function executionKindLabel(kind) {
  if (kind === "hosted-execute")
    return pc28.cyan("hosted");
  if (kind === "provider-assembly")
    return pc28.yellow("provider");
  if (kind === "local-only")
    return pc28.green("local");
  return kind;
}
function hr3(width = 72) {
  return pc28.dim("\u2500".repeat(width));
}
function stripAnsi3(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}
function box3(lines) {
  const padded = lines.map((l) => "  " + l);
  const width = Math.max(...padded.map((l) => stripAnsi3(l).length)) + 4;
  const top = pc28.dim("\u250C" + "\u2500".repeat(width) + "\u2510");
  const bottom = pc28.dim("\u2514" + "\u2500".repeat(width) + "\u2518");
  const body = padded.map((l) => {
    const pad = width - stripAnsi3(l).length;
    return pc28.dim("\u2502") + l + " ".repeat(pad) + pc28.dim("\u2502");
  });
  return [top, ...body, bottom].join("\n");
}
function printGroupedCapabilities(nodes) {
  const byFamily = {};
  for (const node of nodes) {
    (byFamily[node.family] ??= []).push(node);
  }
  const families = Object.keys(byFamily).sort();
  const totalFamilies = families.length;
  console.log("");
  console.log(
    pc28.bold("CMS Capability Registry") + pc28.dim(`  ${nodes.length} capabilit${nodes.length !== 1 ? "ies" : "y"}  \xB7  ${totalFamilies} ${totalFamilies !== 1 ? "families" : "family"}`)
  );
  console.log(hr3());
  for (const family of families) {
    const groupNodes = byFamily[family];
    const header = familyBadge(family);
    console.log(`
${header}  ${pc28.dim("(" + groupNodes.length + ")")}`);
    for (const node of groupNodes) {
      const enabledTag = node.enabled ? pc28.green("enabled") : pc28.red("disabled");
      console.log(`  ${pc28.bold(node.slug)}  ${pc28.dim(node.displayName)}  ${enabledTag}`);
      console.log(`  ${pc28.dim("Execution:")} ${executionKindLabel(node.executionKind)}  ${pc28.dim("Outputs:")} ${pc28.dim(node.outputTypes.join(", "))}`);
      if (node.description) {
        console.log(`  ${pc28.dim(node.description)}`);
      }
      console.log("");
    }
  }
  console.log(hr3());
  console.log(pc28.dim("  growthub capability inspect <slug>  \xB7  growthub capability resolve"));
  console.log("");
}
function printCapabilityCard(node) {
  const iconPrefix = node.icon ? `${node.icon}  ` : "";
  const lines = [
    `${iconPrefix}${pc28.bold(node.displayName)}  ${pc28.dim(node.slug)}`,
    `${familyBadge(node.family)}  ${node.enabled ? pc28.green("enabled") : pc28.red("disabled")}`,
    "",
    `${pc28.dim("Category:")}          ${node.category}`,
    `${pc28.dim("Node Type:")}         ${node.nodeType}`,
    `${pc28.dim("Execution Kind:")}    ${executionKindLabel(node.executionKind)}`,
    `${pc28.dim("Execution Strategy:")} ${node.executionBinding.strategy}`,
    `${pc28.dim("Tool Name:")}         ${node.executionTokens.tool_name}`,
    `${pc28.dim("Output Types:")}      ${node.outputTypes.join(", ")}`,
    `${pc28.dim("Required Bindings:")} ${node.requiredBindings.length > 0 ? node.requiredBindings.join(", ") : pc28.dim("(none)")}`
  ];
  if (node.description) {
    lines.push("", pc28.dim(node.description));
  }
  const inputKeys = Object.keys(node.executionTokens.input_template);
  if (inputKeys.length > 0) {
    lines.push("", `${pc28.dim("Input fields:")} ${inputKeys.join(", ")}`);
  }
  console.log("");
  console.log(box3(lines));
  console.log("");
}
async function runCapabilityPicker(opts) {
  printPaperclipCliBanner();
  p19.intro(pc28.bold("CMS Capability Registry"));
  const access = getWorkflowAccess();
  if (access.state !== "ready") {
    p19.note(
      [
        "Capabilities are unavailable until the hosted user is linked to this local machine.",
        access.reason
      ].join("\n"),
      "Growthub Local Machine Required"
    );
    return opts.allowBackToHub ? "back" : "done";
  }
  const registry = createCmsCapabilityRegistryClient();
  while (true) {
    const familyChoice = await p19.select({
      message: "Filter by capability family",
      options: [
        { value: "all", label: "All Families" },
        ...CAPABILITY_FAMILIES.map((family) => {
          const cfg = FAMILY_CONFIG[family];
          return {
            value: family,
            label: cfg ? `${cfg.emoji}  ${cfg.label}` : family
          };
        }),
        ...opts.allowBackToHub ? [{ value: "__back_to_hub", label: "\u2190 Back to main menu" }] : []
      ]
    });
    if (p19.isCancel(familyChoice)) {
      p19.cancel("Cancelled.");
      process.exit(0);
    }
    if (familyChoice === "__back_to_hub")
      return "back";
    const query = familyChoice === "all" ? void 0 : { family: familyChoice };
    let result;
    try {
      result = await registry.listCapabilities(query);
    } catch (err) {
      p19.log.error("Failed to load capabilities: " + err.message);
      continue;
    }
    if (result.nodes.length === 0) {
      p19.note("No capabilities available for that family.", "Nothing found");
      continue;
    }
    while (true) {
      const capChoice = await p19.select({
        message: "Select capability",
        options: [
          ...result.nodes.map((n) => ({
            value: n.slug,
            label: `${familyBadge(n.family)}  ` + pc28.bold(n.displayName) + "  " + pc28.dim(n.slug),
            hint: n.description ? n.description.slice(0, 55) : void 0
          })),
          { value: "__back_to_family", label: "\u2190 Back to family filter" }
        ]
      });
      if (p19.isCancel(capChoice)) {
        p19.cancel("Cancelled.");
        process.exit(0);
      }
      if (capChoice === "__back_to_family")
        break;
      const selected = result.nodes.find((n) => n.slug === capChoice);
      if (!selected)
        continue;
      printCapabilityCard(selected);
      const nextStep = await p19.select({
        message: "Next step",
        options: [
          { value: "resolve", label: "\u{1F50D} Check machine binding" },
          { value: "back_to_caps", label: "\u2190 Back to capability list" }
        ]
      });
      if (p19.isCancel(nextStep)) {
        p19.cancel("Cancelled.");
        process.exit(0);
      }
      if (nextStep === "back_to_caps")
        continue;
      if (nextStep === "resolve") {
        try {
          const resolver = createMachineCapabilityResolver();
          const binding = await resolver.resolveCapability(selected.slug);
          if (binding) {
            const statusColor3 = binding.allowed ? pc28.green : pc28.red;
            console.log("");
            console.log(box3([
              `${pc28.bold("Machine Binding:")} ${selected.slug}`,
              `${pc28.dim("Allowed:")}  ${statusColor3(String(binding.allowed))}`,
              `${pc28.dim("Reason:")}   ${binding.reason ?? "\u2014"}`,
              ...binding.machineConnectionId ? [`${pc28.dim("Connection:")} ${binding.machineConnectionId}`] : []
            ]));
            console.log("");
          }
        } catch (err) {
          p19.log.error("Resolution failed: " + err.message);
        }
      }
    }
  }
}
function registerCapabilityCommands(program2) {
  const cap = program2.command("capability").description("Discover and inspect CMS-backed runtime node capabilities").addHelpText("after", `
Examples:
  $ growthub capability                     # interactive browser
  $ growthub capability list                # all capabilities grouped by family
  $ growthub capability list --family video # filter by family
  $ growthub capability list --json         # machine-readable output
  $ growthub capability inspect video-gen   # inspect a specific capability
  $ growthub capability resolve             # resolve machine bindings for all
`);
  cap.action(async () => {
    await runCapabilityPicker({});
  });
  cap.command("list").description("List all CMS-backed runtime node capabilities").option("--family <family>", "Filter by family (video, image, slides, text, data, ops)").option("--json", "Output raw JSON for scripting").action(async (opts) => {
    const access = getWorkflowAccess();
    if (access.state !== "ready") {
      console.error(pc28.red(`${access.reason}.`));
      process.exitCode = 1;
      return;
    }
    const registry = createCmsCapabilityRegistryClient();
    const query = opts.family ? { family: opts.family } : void 0;
    try {
      const { nodes, meta } = await registry.listCapabilities(query);
      if (opts.json) {
        console.log(JSON.stringify({ nodes, meta }, null, 2));
        return;
      }
      if (nodes.length === 0) {
        console.error(pc28.yellow("No capabilities found" + (opts.family ? ` for family: ${opts.family}` : "") + "."));
        console.error(pc28.dim("Valid families: " + CAPABILITY_FAMILIES.join(", ")));
        process.exitCode = 1;
        return;
      }
      printGroupedCapabilities(nodes);
      console.log(pc28.dim(`  Source: ${meta.source}  \xB7  Fetched: ${meta.fetchedAt}`));
      console.log("");
    } catch (err) {
      console.error(pc28.red("Failed to list capabilities: " + err.message));
      process.exitCode = 1;
    }
  });
  cap.command("inspect").description("Inspect a specific CMS capability node").argument("<slug>", "Capability slug (e.g. 'video-gen', 'text-gen')").option("--json", "Output raw JSON").action(async (slug, opts) => {
    const access = getWorkflowAccess();
    if (access.state !== "ready") {
      console.error(pc28.red(`${access.reason}.`));
      process.exitCode = 1;
      return;
    }
    const registry = createCmsCapabilityRegistryClient();
    try {
      const node = await registry.getCapability(slug);
      if (!node) {
        console.error(pc28.red(`Unknown capability: "${slug}".`) + pc28.dim(" Run `growthub capability list` to browse."));
        process.exitCode = 1;
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(node, null, 2));
        return;
      }
      printCapabilityCard(node);
    } catch (err) {
      console.error(pc28.red("Failed to inspect capability: " + err.message));
      process.exitCode = 1;
    }
  });
  cap.command("resolve").description("Resolve machine-scoped capability bindings for all capabilities").option("--json", "Output raw JSON").action(async (opts) => {
    const access = getWorkflowAccess();
    if (access.state !== "ready") {
      console.error(pc28.red(`${access.reason}.`));
      process.exitCode = 1;
      return;
    }
    try {
      const resolver = createMachineCapabilityResolver();
      const result = await resolver.resolveAll();
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("");
      console.log(pc28.bold("Machine Capability Resolution"));
      console.log(hr3());
      console.log(`  ${pc28.dim("Hostname:")}  ${result.machineContext.hostname}`);
      console.log(`  ${pc28.dim("Instance:")}  ${result.machineContext.instanceId}`);
      console.log(`  ${pc28.dim("Session:")}   ${result.machineContext.hasActiveSession ? pc28.green("active") : pc28.red("none")}`);
      if (result.machineContext.machineLabel) {
        console.log(`  ${pc28.dim("Machine:")}   ${result.machineContext.machineLabel}`);
      }
      console.log(`  ${pc28.dim("Entitlements:")} ${result.entitlements.length > 0 ? result.entitlements.join(", ") : pc28.dim("(none)")}`);
      console.log(hr3());
      for (const binding of result.bindings) {
        const statusColor3 = binding.allowed ? pc28.green : pc28.red;
        const statusIcon = binding.allowed ? "\u2713" : "\u2717";
        console.log(
          `  ${statusColor3(statusIcon)} ${pc28.bold(binding.capabilitySlug)}  ${pc28.dim(binding.reason ?? "")}`
        );
      }
      console.log("");
      console.log(pc28.dim(`  Resolved at: ${result.resolvedAt}`));
      console.log("");
    } catch (err) {
      console.error(pc28.red("Failed to resolve capabilities: " + err.message));
      process.exitCode = 1;
    }
  });
}

// src/commands/pipeline.ts
import fs21 from "node:fs";
import path29 from "node:path";
import * as p20 from "@clack/prompts";
import pc30 from "picocolors";

// src/runtime/dynamic-registry-pipeline/index.ts
import { randomBytes as randomBytes6 } from "node:crypto";
function generatePipelineId() {
  return `pipe_${randomBytes6(8).toString("hex")}`;
}
function generateNodeId() {
  return `node_${randomBytes6(6).toString("hex")}`;
}
function createPipelineBuilder(opts) {
  const pipelineId = generatePipelineId();
  const nodes = [];
  const executionMode = opts?.executionMode ?? "hosted";
  const threadId = opts?.threadId;
  const metadata = opts?.metadata;
  return {
    addNode(slug, bindings, upstreamNodeIds) {
      const id = generateNodeId();
      nodes.push({ id, slug, bindings, upstreamNodeIds });
      return id;
    },
    build() {
      return {
        pipelineId,
        threadId,
        nodes: [...nodes],
        executionMode,
        metadata
      };
    },
    getNodes() {
      return nodes;
    },
    async validate(registry) {
      const capabilityMap = registry ?? await fetchCapabilityMap();
      const issues2 = [];
      if (nodes.length === 0) {
        issues2.push({
          severity: "error",
          message: "Pipeline has no nodes."
        });
      }
      const nodeIds = new Set(nodes.map((n) => n.id));
      const seenSlugs = /* @__PURE__ */ new Set();
      for (const node of nodes) {
        const capability = capabilityMap.get(node.slug);
        if (!capability) {
          issues2.push({
            severity: "error",
            nodeId: node.id,
            field: "slug",
            message: `Unknown capability slug: "${node.slug}". Not found in the registry.`
          });
          continue;
        }
        if (!capability.enabled) {
          issues2.push({
            severity: "warning",
            nodeId: node.id,
            field: "slug",
            message: `Capability "${node.slug}" is disabled for this user/org.`
          });
        }
        for (const requiredBinding of capability.requiredBindings) {
          if (!(requiredBinding in node.bindings)) {
            issues2.push({
              severity: "error",
              nodeId: node.id,
              field: `bindings.${requiredBinding}`,
              message: `Missing required binding "${requiredBinding}" for capability "${node.slug}".`
            });
          }
        }
        if (node.upstreamNodeIds) {
          for (const upId of node.upstreamNodeIds) {
            if (!nodeIds.has(upId)) {
              issues2.push({
                severity: "error",
                nodeId: node.id,
                field: "upstreamNodeIds",
                message: `Upstream node "${upId}" does not exist in the pipeline.`
              });
            }
          }
        }
        seenSlugs.add(node.slug);
      }
      const cycleIssue = detectCycle(nodes);
      if (cycleIssue) {
        issues2.push(cycleIssue);
      }
      return {
        valid: issues2.every((i) => i.severity !== "error"),
        issues: issues2
      };
    },
    async package(registry) {
      const capabilityMap = registry ?? await fetchCapabilityMap();
      const pipeline = this.build();
      const nodeRoutes = {};
      const routeSet = /* @__PURE__ */ new Set();
      for (const node of pipeline.nodes) {
        const capability = capabilityMap.get(node.slug);
        const route = capability?.executionKind ?? "hosted-execute";
        nodeRoutes[node.id] = route;
        routeSet.add(route);
      }
      let executionRoute;
      if (routeSet.size === 1) {
        const single = [...routeSet][0];
        executionRoute = single === "local-only" ? "hosted-execute" : single;
      } else {
        executionRoute = "mixed";
      }
      return {
        pipeline,
        executionRoute,
        nodeRoutes
      };
    }
  };
}
function deserializePipeline(raw) {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid pipeline: expected an object.");
  }
  const record = raw;
  const pipelineRaw = record.version === 1 && record.pipeline ? record.pipeline : record;
  const pipelineId = typeof pipelineRaw.pipelineId === "string" ? pipelineRaw.pipelineId : generatePipelineId();
  const nodes = Array.isArray(pipelineRaw.nodes) ? pipelineRaw.nodes : [];
  const executionMode = pipelineRaw.executionMode === "local" || pipelineRaw.executionMode === "hosted" || pipelineRaw.executionMode === "hybrid" ? pipelineRaw.executionMode : "hosted";
  return {
    pipelineId,
    threadId: typeof pipelineRaw.threadId === "string" ? pipelineRaw.threadId : void 0,
    nodes,
    executionMode,
    metadata: typeof pipelineRaw.metadata === "object" && pipelineRaw.metadata !== null ? pipelineRaw.metadata : void 0
  };
}
async function fetchCapabilityMap() {
  const registry = createCmsCapabilityRegistryClient();
  const { nodes } = await registry.listCapabilities({ enabledOnly: false });
  return new Map(nodes.map((n) => [n.slug, n]));
}
function detectCycle(nodes) {
  const adjacency = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    adjacency.set(node.id, node.upstreamNodeIds ?? []);
  }
  const visited = /* @__PURE__ */ new Set();
  const inStack = /* @__PURE__ */ new Set();
  function dfs(nodeId) {
    if (inStack.has(nodeId))
      return true;
    if (visited.has(nodeId))
      return false;
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const upstream of adjacency.get(nodeId) ?? []) {
      if (dfs(upstream))
        return true;
    }
    inStack.delete(nodeId);
    return false;
  }
  for (const node of nodes) {
    if (dfs(node.id)) {
      return {
        severity: "error",
        message: "Pipeline contains a dependency cycle."
      };
    }
  }
  return null;
}

// src/runtime/cms-node-contracts/introspect.ts
function toFieldType(value) {
  if (Array.isArray(value))
    return "array";
  if (typeof value === "string")
    return "string";
  if (typeof value === "number")
    return "number";
  if (typeof value === "boolean")
    return "boolean";
  if (value && typeof value === "object")
    return "object";
  return "unknown";
}
function outputTypeFromSchema(value) {
  if (typeof value === "string")
    return value;
  if (value && typeof value === "object" && typeof value.type === "string") {
    return value.type;
  }
  return toFieldType(value);
}
function humanizeFieldKey(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());
}
function introspectNodeContract(node) {
  const inputTemplate = node.executionTokens.input_template ?? {};
  const outputMapping = node.executionTokens.output_mapping ?? {};
  const inputs = Object.entries(inputTemplate).map(([key, value]) => {
    const required = value === "" || value === null || value === void 0;
    return {
      key,
      label: humanizeFieldKey(key),
      type: toFieldType(value),
      required,
      defaultValue: value
    };
  });
  const outputs = Object.entries(outputMapping).map(([key, value]) => ({
    key,
    type: outputTypeFromSchema(value),
    required: false
  }));
  return {
    slug: node.slug,
    displayName: node.displayName,
    family: node.family,
    nodeType: node.nodeType,
    executionKind: node.executionKind,
    executionStrategy: node.executionBinding.strategy,
    requiredBindings: node.requiredBindings ?? [],
    outputTypes: node.outputTypes ?? [],
    inputs,
    outputs
  };
}

// src/runtime/cms-node-contracts/normalize.ts
function sanitizeValue(value) {
  if (typeof value === "string") {
    return isPlaceholderString(value) ? "" : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)])
    );
  }
  return value;
}
function coerceValue(value, templateValue) {
  if (templateValue === void 0)
    return value;
  if (typeof templateValue === "number") {
    if (typeof value === "number")
      return value;
    if (typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Number(value))) {
      return Number(value);
    }
    return templateValue;
  }
  if (typeof templateValue === "boolean") {
    if (typeof value === "boolean")
      return value;
    if (typeof value === "string") {
      if (value.toLowerCase() === "true")
        return true;
      if (value.toLowerCase() === "false")
        return false;
    }
    return templateValue;
  }
  if (Array.isArray(templateValue)) {
    return Array.isArray(value) ? value : templateValue;
  }
  if (templateValue && typeof templateValue === "object") {
    if (value && typeof value === "object" && !Array.isArray(value))
      return value;
    return templateValue;
  }
  return value;
}
function normalizeNodeBindings(rawBindings, node) {
  const template = node.executionTokens.input_template ?? {};
  const incoming = rawBindings ?? {};
  const merged = {};
  let providedCount = 0;
  let defaultedCount = 0;
  let normalizedCount = 0;
  for (const [key, templateValue] of Object.entries(template)) {
    const hasIncoming = Object.prototype.hasOwnProperty.call(incoming, key);
    const rawValue = hasIncoming ? incoming[key] : templateValue;
    const sanitized = sanitizeValue(rawValue);
    const coerced = coerceValue(sanitized, templateValue);
    merged[key] = coerced;
    if (hasIncoming)
      providedCount += 1;
    if (!hasIncoming)
      defaultedCount += 1;
    if (sanitized !== rawValue || coerced !== sanitized)
      normalizedCount += 1;
  }
  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in merged)) {
      merged[key] = sanitizeValue(value);
      providedCount += 1;
    }
  }
  return {
    bindings: merged,
    providedCount,
    defaultedCount,
    normalizedCount
  };
}
function validateNodeBindings(normalizedBindings, node) {
  const contract = introspectNodeContract(node);
  const missingRequiredInputs = [];
  const missingRequiredBindings = [];
  for (const input of contract.inputs) {
    if (!input.required)
      continue;
    const value = normalizedBindings[input.key];
    if (value === void 0 || value === null || value === "") {
      missingRequiredInputs.push(input.key);
    }
  }
  for (const key of contract.requiredBindings) {
    const value = normalizedBindings[key];
    if (value === void 0 || value === null || value === "") {
      missingRequiredBindings.push(key);
    }
  }
  const warnings = [];
  if (missingRequiredBindings.length > 0) {
    warnings.push(`Missing required bindings: ${missingRequiredBindings.join(", ")}`);
  }
  if (missingRequiredInputs.length > 0) {
    warnings.push(`Missing required inputs: ${missingRequiredInputs.join(", ")}`);
  }
  return {
    valid: missingRequiredBindings.length === 0 && missingRequiredInputs.length === 0,
    missingRequiredInputs,
    missingRequiredBindings,
    warnings
  };
}

// src/runtime/cms-node-contracts/compile.ts
function inferWorkflowName(pipeline) {
  const metadataName = pipeline.metadata?.workflowName;
  if (typeof metadataName === "string" && metadataName.trim().length > 0) {
    return metadataName.trim();
  }
  return pipeline.pipelineId?.trim() || `${pipeline.nodes[0]?.slug ?? "workflow"} workflow`;
}
function compileToHostedWorkflowConfig(pipeline, opts) {
  const cmsNodes = pipeline.nodes.map((node, index51) => ({
    id: node.id,
    type: "cmsNode",
    position: { x: (index51 + 1) * 300, y: 0 },
    data: {
      slug: node.slug,
      inputs: node.bindings
    }
  }));
  const edges = [];
  for (const node of pipeline.nodes) {
    const upstreamNodeIds = node.upstreamNodeIds ?? [];
    if (upstreamNodeIds.length === 0) {
      edges.push({
        id: `e-start-1-${node.id}`,
        source: "start-1",
        target: node.id
      });
      continue;
    }
    for (const upstreamNodeId of upstreamNodeIds) {
      edges.push({
        id: `e-${upstreamNodeId}-${node.id}`,
        source: upstreamNodeId,
        target: node.id
      });
    }
  }
  const upstreamSources = new Set(
    pipeline.nodes.flatMap((node) => node.upstreamNodeIds ?? [])
  );
  for (const node of pipeline.nodes) {
    if (!upstreamSources.has(node.id)) {
      edges.push({
        id: `e-${node.id}-end-1`,
        source: node.id,
        target: "end-1"
      });
    }
  }
  return {
    name: opts?.workflowName ?? inferWorkflowName(pipeline),
    nodes: [
      { id: "start-1", type: "start", position: { x: 0, y: 0 }, data: {} },
      ...cmsNodes,
      { id: "end-1", type: "end", position: { x: (cmsNodes.length + 1) * 300, y: 0 }, data: {} }
    ],
    edges
  };
}

// src/runtime/cms-node-contracts/presenter.ts
import pc29 from "picocolors";
function renderInputLine(input) {
  const required = input.required ? pc29.red("required") : pc29.green("optional");
  return `${pc29.dim("\xB7")} ${input.label} ${pc29.dim(`(${input.type})`)} ${required}`;
}
function countNodeAssets(bindings) {
  let count = 0;
  for (const [key, value] of Object.entries(bindings)) {
    if (Array.isArray(value) && (key.toLowerCase().includes("image") || key.toLowerCase().includes("asset") || key.toLowerCase().includes("ref"))) {
      count += value.length;
    }
  }
  return count;
}
function renderContractCard(contract) {
  const lines = [
    `${pc29.bold(contract.displayName)}  ${pc29.dim(contract.slug)}`,
    `${pc29.dim("Family:")} ${contract.family}  ${pc29.dim("Execution:")} ${contract.executionStrategy}`,
    `${pc29.dim("Kind:")} ${contract.executionKind}  ${pc29.dim("Node Type:")} ${contract.nodeType}`,
    `${pc29.dim("Bindings:")} ${contract.requiredBindings.length > 0 ? contract.requiredBindings.join(", ") : "none"}`,
    `${pc29.dim("Outputs:")} ${contract.outputTypes.length > 0 ? contract.outputTypes.join(", ") : "none"}`
  ];
  if (contract.inputs.length > 0) {
    lines.push("", pc29.bold("Input Contract"));
    lines.push(...contract.inputs.map(renderInputLine));
  }
  if (contract.outputs.length > 0) {
    lines.push("", pc29.bold("Output Contract"));
    lines.push(
      ...contract.outputs.map((output) => `${pc29.dim("\xB7")} ${output.key} ${pc29.dim(`(${output.type})`)}`)
    );
  }
  return lines;
}
function buildPreExecutionSummary(input) {
  const warnings = [];
  const nodes = input.pipeline.nodes.map((node) => {
    const capability = input.registryBySlug.get(node.slug);
    if (!capability) {
      warnings.push(`Unknown capability slug: ${node.slug}`);
      return {
        nodeId: node.id,
        slug: node.slug,
        requiredMissing: [],
        bindingCount: Object.keys(node.bindings ?? {}).length,
        assetCount: countNodeAssets(node.bindings ?? {}),
        outputTypes: []
      };
    }
    const normalized = normalizeNodeBindings(node.bindings, capability);
    const validation = validateNodeBindings(normalized.bindings, capability);
    const contract = introspectNodeContract(capability);
    if (!validation.valid) {
      warnings.push(
        `${node.slug}: ${[...validation.missingRequiredBindings, ...validation.missingRequiredInputs].join(", ")}`
      );
    }
    return {
      nodeId: node.id,
      slug: node.slug,
      requiredMissing: [...validation.missingRequiredBindings, ...validation.missingRequiredInputs],
      bindingCount: Object.keys(normalized.bindings).length,
      assetCount: countNodeAssets(normalized.bindings),
      outputTypes: contract.outputTypes
    };
  });
  const normalizedPipeline = {
    ...input.pipeline,
    nodes: input.pipeline.nodes.map((node) => {
      const capability = input.registryBySlug.get(node.slug);
      if (!capability)
        return node;
      const normalized = normalizeNodeBindings(node.bindings, capability);
      return { ...node, bindings: normalized.bindings };
    })
  };
  return {
    pipelineId: input.pipeline.pipelineId,
    executionMode: input.pipeline.executionMode,
    nodeCount: input.pipeline.nodes.length,
    warnings,
    nodes,
    compiledConfig: compileToHostedWorkflowConfig(normalizedPipeline)
  };
}
function renderPreExecutionSummary(summary) {
  const lines = [
    `${pc29.bold("Pre-Execution Contract Summary")} ${pc29.dim(summary.pipelineId)}`,
    `${pc29.dim("Mode:")} ${summary.executionMode}  ${pc29.dim("Nodes:")} ${summary.nodeCount}`,
    `${pc29.dim("Compiled:")} ${summary.compiledConfig.nodes.length} nodes / ${summary.compiledConfig.edges.length} edges`,
    ""
  ];
  for (const [index51, node] of summary.nodes.entries()) {
    const missing = node.requiredMissing.length > 0 ? pc29.red(`missing: ${node.requiredMissing.join(", ")}`) : pc29.green("ready");
    const outputs = node.outputTypes.length > 0 ? node.outputTypes.join(", ") : "none";
    lines.push(
      `${pc29.dim(`${index51 + 1}.`)} ${pc29.bold(node.slug)} ${pc29.dim(node.nodeId)} \xB7 bindings=${node.bindingCount} \xB7 assets=${node.assetCount} \xB7 outputs=${outputs} \xB7 ${missing}`
    );
  }
  if (summary.warnings.length > 0) {
    lines.push("", pc29.yellow("Warnings"));
    lines.push(...summary.warnings.map((warning) => `${pc29.dim("\xB7")} ${warning}`));
  }
  return lines;
}
function renderPreSaveReview(input) {
  const lines = [
    `${pc29.bold("Pre-Save Workflow Review")} ${pc29.dim(input.workflowName)}`,
    `${pc29.dim("Pipeline:")} ${input.summary.pipelineId}`,
    `${pc29.dim("Mode:")} ${input.summary.executionMode}`,
    `${pc29.dim("Compiled:")} ${input.summary.compiledConfig.nodes.length} nodes / ${input.summary.compiledConfig.edges.length} edges`
  ];
  if (input.summary.warnings.length > 0) {
    lines.push("", pc29.yellow(`Warnings: ${input.summary.warnings.length}`));
  }
  return lines;
}

// src/runtime/artifact-contracts/index.ts
init_home();
import fs19 from "node:fs";
import path27 from "node:path";
import { randomBytes as randomBytes7 } from "node:crypto";
function generateArtifactId() {
  return `art_${randomBytes7(8).toString("hex")}`;
}
function resolveArtifactsDir() {
  return path27.resolve(resolvePaperclipHomeDir(), "artifacts");
}
function resolveArtifactManifestPath(artifactId) {
  return path27.resolve(resolveArtifactsDir(), `${artifactId}.json`);
}
function readLocalManifest(artifactId) {
  const filePath = resolveArtifactManifestPath(artifactId);
  if (!fs19.existsSync(filePath))
    return null;
  try {
    return JSON.parse(fs19.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function writeLocalManifest(manifest) {
  const dir = resolveArtifactsDir();
  fs19.mkdirSync(dir, { recursive: true });
  const filePath = resolveArtifactManifestPath(manifest.id);
  fs19.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}
`, { mode: 384 });
}
function listLocalManifests() {
  const dir = resolveArtifactsDir();
  if (!fs19.existsSync(dir))
    return [];
  return fs19.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => {
    try {
      const content = fs19.readFileSync(path27.resolve(dir, entry.name), "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }).filter((m) => m !== null).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
function matchesQuery2(manifest, query) {
  if (query.artifactType && manifest.artifactType !== query.artifactType)
    return false;
  if (query.pipelineId && manifest.pipelineId !== query.pipelineId)
    return false;
  if (query.sourceNodeSlug && manifest.sourceNodeSlug !== query.sourceNodeSlug)
    return false;
  if (query.executionContext && manifest.executionContext !== query.executionContext)
    return false;
  if (query.status && manifest.status !== query.status)
    return false;
  if (query.threadId && manifest.threadId !== query.threadId)
    return false;
  return true;
}
function createArtifactManifest(input) {
  return {
    id: generateArtifactId(),
    artifactType: input.artifactType,
    sourceNodeSlug: input.sourceNodeSlug,
    createdByConnectionId: input.createdByConnectionId,
    executionContext: input.executionContext,
    status: "pending",
    pipelineId: input.pipelineId,
    nodeId: input.nodeId,
    threadId: input.threadId,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    metadata: input.metadata ?? {}
  };
}
function createArtifactStore() {
  return {
    create(input) {
      const manifest = createArtifactManifest(input);
      writeLocalManifest(manifest);
      return manifest;
    },
    get(artifactId) {
      return readLocalManifest(artifactId);
    },
    list(query) {
      let artifacts = listLocalManifests();
      if (query) {
        artifacts = artifacts.filter((m) => matchesQuery2(m, query));
      }
      if (query?.limit && query.limit > 0) {
        artifacts = artifacts.slice(0, query.limit);
      }
      return {
        artifacts,
        meta: {
          total: artifacts.length,
          source: "local",
          fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      };
    },
    update(artifactId, patch) {
      const existing = readLocalManifest(artifactId);
      if (!existing)
        return null;
      const updated = {
        ...existing,
        ...patch.status !== void 0 ? { status: patch.status } : {},
        ...patch.metadata !== void 0 ? { metadata: { ...existing.metadata, ...patch.metadata } } : {},
        updatedAt: patch.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString()
      };
      writeLocalManifest(updated);
      return updated;
    },
    getStorePath() {
      return resolveArtifactsDir();
    }
  };
}

// src/runtime/native-intelligence/index.ts
init_home();
import fs20 from "node:fs";
import path28 from "node:path";

// src/runtime/native-intelligence/contract.ts
var DEFAULT_INTELLIGENCE_CONFIG = {
  modelId: "gemma3",
  backendType: "local",
  endpoint: "http://localhost:8080/v1/chat/completions",
  defaultTemperature: 0.3,
  defaultMaxTokens: 4096,
  timeoutMs: 3e4
};

// src/runtime/native-intelligence/provider.ts
function createNativeIntelligenceBackend(config) {
  return {
    async complete(input) {
      const startMs = Date.now();
      const messages = [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt }
      ];
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        config.timeoutMs ?? 3e4
      );
      try {
        const headers = {
          "content-type": "application/json",
          accept: "application/json"
        };
        if (config.apiKey) {
          headers.authorization = `Bearer ${config.apiKey}`;
        }
        const modelCandidates = resolveModelCandidates(config);
        const endpointCandidates = resolveEndpointCandidates(config);
        let result = null;
        let lastError = null;
        for (let endpointIndex = 0; endpointIndex < endpointCandidates.length; endpointIndex += 1) {
          const endpoint = endpointCandidates[endpointIndex];
          for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
            const model = modelCandidates[modelIndex];
            const body = {
              model,
              messages,
              temperature: input.temperature ?? config.defaultTemperature ?? 0.3,
              max_tokens: input.maxTokens ?? config.defaultMaxTokens ?? 4096
            };
            if (input.responseFormat === "json") {
              body.response_format = { type: "json_object" };
            }
            try {
              const response = await fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: controller.signal
              });
              if (response.ok) {
                result = await response.json();
                break;
              }
              const errorText4 = await response.text().catch(() => "");
              const backendError = new NativeIntelligenceBackendError(
                response.status,
                `Model backend responded with ${response.status}: ${errorText4 || response.statusText}`
              );
              lastError = backendError;
              if (!shouldTryNextModel(response.status, errorText4, model, config, modelCandidates)) {
                throw backendError;
              }
            } catch (err) {
              if (err instanceof NativeIntelligenceBackendError) {
                throw err;
              }
              lastError = new NativeIntelligenceBackendError(
                502,
                err instanceof Error ? err.message : "Unknown backend error"
              );
              const hasAnotherEndpoint = endpointIndex < endpointCandidates.length - 1;
              if (!hasAnotherEndpoint) {
                throw lastError;
              }
              break;
            }
          }
          if (result)
            break;
        }
        if (!result) {
          throw lastError ?? new NativeIntelligenceBackendError(502, "Model backend returned no response.");
        }
        const latencyMs = Date.now() - startMs;
        const text63 = extractCompletionText(result);
        return {
          text: text63,
          usage: result.usage ? {
            promptTokens: result.usage.prompt_tokens ?? 0,
            completionTokens: result.usage.completion_tokens ?? 0,
            totalTokens: result.usage.total_tokens ?? 0
          } : void 0,
          modelId: result.model ?? config.modelId,
          latencyMs
        };
      } finally {
        clearTimeout(timeoutId);
      }
    }
  };
}
function resolveModelCandidates(config) {
  const primary = config.modelId;
  const candidates = [];
  if (typeof config.localModel === "string" && config.localModel.trim().length > 0) {
    candidates.push(config.localModel.trim());
  }
  const envLocalModel = process.env.NATIVE_INTELLIGENCE_LOCAL_MODEL?.trim() || process.env.OLLAMA_MODEL?.trim();
  if (envLocalModel && !candidates.includes(envLocalModel)) {
    candidates.push(envLocalModel);
  }
  if (!candidates.includes(primary)) {
    candidates.push(primary);
  }
  if (config.backendType === "local" && primary === "gemma3" && !candidates.includes("gemma3:4b")) {
    candidates.push("gemma3:4b");
  }
  return candidates;
}
function resolveEndpointCandidates(config) {
  const primary = config.endpoint;
  const candidates = [primary];
  if (config.backendType !== "local")
    return candidates;
  const normalized = primary.toLowerCase();
  if ((normalized.includes("localhost:8080") || normalized.includes("127.0.0.1:8080")) && !candidates.includes("http://127.0.0.1:11434/v1/chat/completions")) {
    candidates.push("http://127.0.0.1:11434/v1/chat/completions");
  }
  return candidates;
}
function shouldTryNextModel(status, errorText4, attemptedModel, config, candidates) {
  const hasNextCandidate = candidates[candidates.length - 1] !== attemptedModel;
  if (!hasNextCandidate)
    return false;
  if (config.backendType !== "local")
    return false;
  const normalizedError = errorText4.toLowerCase();
  return status === 404 || normalizedError.includes("model") && normalizedError.includes("not found");
}
function extractCompletionText(response) {
  if (response.choices && response.choices.length > 0) {
    const choice = response.choices[0];
    if (choice.message?.content)
      return choice.message.content;
    if (choice.text)
      return choice.text;
  }
  throw new NativeIntelligenceBackendError(
    502,
    "Model backend returned no completion text."
  );
}
async function checkBackendHealth(config) {
  const startMs = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5e3);
    try {
      const response = await fetch(config.endpoint.replace(/\/chat\/completions$/, "/models"), {
        method: "GET",
        headers: {
          accept: "application/json",
          ...config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}
        },
        signal: controller.signal
      });
      const latencyMs = Date.now() - startMs;
      return { available: response.ok, latencyMs };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    return {
      available: false,
      latencyMs,
      error: err instanceof Error ? err.message : "Unknown error"
    };
  }
}
var NativeIntelligenceBackendError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};

// src/runtime/native-intelligence/summarizer.ts
var SUMMARIZER_SYSTEM_PROMPT = `You are a workflow execution analyst for the Growthub platform.
Your job is to produce clear, concise, actionable summaries about workflow pipelines.

You analyze:
- Pipeline graph structure (node slugs, bindings, upstream dependencies)
- Contract truth (required/optional inputs, output types, execution strategies)
- Execution results when available (success/failure per node, artifacts produced)
- Runtime mode (local, hosted, hybrid)

Your summaries must be:
- Specific: reference actual node slugs and binding names
- Actionable: tell the user what to fix or what to expect
- Concise: under 200 words for each summary section
- Honest: flag real issues, don't invent phantom problems

You NEVER recommend running workflows, only explain and analyze them.
You NEVER generate executable code or modify pipeline configurations.

Respond in JSON with this schema:
{
  "title": "string \u2014 short summary title",
  "explanation": "string \u2014 1-3 sentence overview of the pipeline",
  "missingBindingGuidance": ["string \u2014 one per missing binding with fix guidance"],
  "runtimeModeNote": "string | null \u2014 note about execution mode implications",
  "outputExpectation": "string | null \u2014 what artifacts/outputs to expect",
  "costLatencyCautions": ["string \u2014 cost or latency warnings"],
  "warnings": ["string \u2014 other warnings"],
  "confidence": "number 0-1 \u2014 how confident in the analysis"
}`;
async function summarizeExecution2(input, backend) {
  const userPrompt = buildSummarizerPrompt(input);
  try {
    const completion = await backend.complete({
      systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.2,
      maxTokens: 2048,
      responseFormat: "json"
    });
    const parsed = parseJsonSafe(completion.text);
    if (parsed) {
      return validateSummaryResult(parsed);
    }
  } catch {
  }
  return buildDeterministicSummary(input);
}
function buildDeterministicSummary(input) {
  const { pipeline, registryContext, phase, executionResult } = input;
  const nodeCount = pipeline.nodes.length;
  const slugs = pipeline.nodes.map((n) => n.slug);
  const allMissing = pipeline.nodes.flatMap((n) => n.missingRequired);
  const allWarnings = [...pipeline.warnings];
  const costCautions = [];
  const missingGuidance = [];
  for (const node of pipeline.nodes) {
    for (const field of node.missingRequired) {
      const contract = registryContext.find((c) => c.slug === node.slug);
      const inputField = contract?.inputs.find((i) => i.key === field);
      const label = inputField?.label ?? field;
      missingGuidance.push(
        `${node.slug}: "${label}" (${field}) is required but missing. Provide a value before execution.`
      );
    }
  }
  for (const node of pipeline.nodes) {
    if (node.outputTypes.includes("video")) {
      costCautions.push(`${node.slug}: video generation may have higher latency and cost.`);
    }
    if (node.assetCount > 5) {
      costCautions.push(`${node.slug}: ${node.assetCount} assets referenced \u2014 verify all are accessible.`);
    }
  }
  let title;
  let explanation;
  let runtimeModeNote;
  let outputExpectation;
  if (phase === "pre-save") {
    title = `Pre-Save Review: ${nodeCount}-node pipeline`;
    explanation = `Pipeline "${pipeline.pipelineId}" contains ${nodeCount} node(s): ${slugs.join(", ")}. ` + (allMissing.length > 0 ? `${allMissing.length} required binding(s) are missing.` : "All required bindings are present.");
  } else if (phase === "pre-execution") {
    title = `Pre-Execution Summary: ${nodeCount} node(s)`;
    explanation = `About to execute pipeline "${pipeline.pipelineId}" with ${nodeCount} node(s) in ${pipeline.executionMode} mode. ` + (allMissing.length > 0 ? `Warning: ${allMissing.length} required binding(s) are unresolved.` : "All bindings are resolved.");
    runtimeModeNote = pipeline.executionMode === "hosted" ? "Running in hosted mode \u2014 execution happens on Growthub servers." : pipeline.executionMode === "local" ? "Running in local mode \u2014 execution happens on this machine." : "Running in hybrid mode \u2014 some nodes execute locally, others hosted.";
  } else if (phase === "post-execution" && executionResult) {
    title = `Execution ${executionResult.status === "succeeded" ? "Completed" : "Failed"}: ${nodeCount} node(s)`;
    const succeeded = Object.values(executionResult.nodeStatuses).filter((s) => s === "succeeded").length;
    const failed = Object.values(executionResult.nodeStatuses).filter((s) => s === "failed").length;
    explanation = `Execution finished: ${succeeded} succeeded, ${failed} failed. ` + (executionResult.artifactCount > 0 ? `${executionResult.artifactCount} artifact(s) produced.` : "No artifacts produced.");
    if (executionResult.errorMessages && executionResult.errorMessages.length > 0) {
      allWarnings.push(...executionResult.errorMessages.map((msg) => `Execution error: ${msg}`));
    }
    outputExpectation = executionResult.outputText ? `Output preview: ${executionResult.outputText.slice(0, 200)}` : void 0;
  } else if (phase === "recommendation") {
    title = `Workflow Analysis: ${nodeCount} node(s)`;
    explanation = `Analyzing pipeline with ${nodeCount} node(s): ${slugs.join(", ")}. This pipeline ${allMissing.length === 0 ? "is ready for execution" : "needs attention before execution"}.`;
  } else {
    title = `Pipeline Summary: ${nodeCount} node(s)`;
    explanation = `Pipeline "${pipeline.pipelineId}" with ${nodeCount} node(s) in ${pipeline.executionMode} mode.`;
  }
  const outputFamilies = new Set(pipeline.nodes.flatMap((n) => n.outputTypes));
  if (!outputExpectation && outputFamilies.size > 0) {
    outputExpectation = `Expected output types: ${[...outputFamilies].join(", ")}.`;
  }
  return {
    title,
    explanation,
    missingBindingGuidance: missingGuidance,
    runtimeModeNote,
    outputExpectation,
    costLatencyCautions: costCautions,
    warnings: allWarnings,
    confidence: 1
  };
}
function buildSummarizerPrompt(input) {
  const { pipeline, registryContext, phase, executionResult } = input;
  const sections = [
    `Phase: ${phase}`,
    `Pipeline ID: ${pipeline.pipelineId}`,
    `Execution Mode: ${pipeline.executionMode}`,
    `Node Count: ${pipeline.nodes.length}`,
    "",
    "Nodes:"
  ];
  for (const node of pipeline.nodes) {
    const contract = registryContext.find((c) => c.slug === node.slug);
    sections.push(
      `  - ${node.slug}: bindings=${node.bindingCount}, missing=[${node.missingRequired.join(",")}], outputs=[${node.outputTypes.join(",")}], assets=${node.assetCount}` + (contract ? `, family=${contract.family}, strategy=${contract.executionStrategy}` : "")
    );
  }
  if (pipeline.warnings.length > 0) {
    sections.push("", "Pipeline Warnings:", ...pipeline.warnings.map((w) => `  - ${w}`));
  }
  if (executionResult) {
    sections.push(
      "",
      "Execution Result:",
      `  Status: ${executionResult.status}`,
      `  Artifacts: ${executionResult.artifactCount}`,
      `  Node Statuses: ${JSON.stringify(executionResult.nodeStatuses)}`
    );
    if (executionResult.errorMessages && executionResult.errorMessages.length > 0) {
      sections.push("  Errors:", ...executionResult.errorMessages.map((e) => `    - ${e}`));
    }
    if (executionResult.outputText) {
      sections.push(`  Output Preview: ${executionResult.outputText.slice(0, 500)}`);
    }
  }
  sections.push("", "Available Contract Context:");
  for (const contract of registryContext.slice(0, 20)) {
    sections.push(
      `  - ${contract.slug} (${contract.family}): inputs=[${contract.inputs.map((i) => `${i.key}:${i.type}${i.required ? "*" : ""}`).join(",")}], outputs=[${contract.outputTypes.join(",")}]`
    );
  }
  return sections.join("\n");
}
function parseJsonSafe(text63) {
  try {
    const trimmed = text63.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    }
    return null;
  } catch {
    return null;
  }
}
function validateSummaryResult(raw) {
  return {
    title: typeof raw.title === "string" ? raw.title : "Pipeline Summary",
    explanation: typeof raw.explanation === "string" ? raw.explanation : "",
    missingBindingGuidance: Array.isArray(raw.missingBindingGuidance) ? raw.missingBindingGuidance : [],
    runtimeModeNote: typeof raw.runtimeModeNote === "string" ? raw.runtimeModeNote : void 0,
    outputExpectation: typeof raw.outputExpectation === "string" ? raw.outputExpectation : void 0,
    costLatencyCautions: Array.isArray(raw.costLatencyCautions) ? raw.costLatencyCautions : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5
  };
}

// src/runtime/native-intelligence/normalizer.ts
var NORMALIZER_SYSTEM_PROMPT = `You are a binding normalizer for the Growthub workflow platform.
Your job is to take raw user/agent input bindings for a CMS workflow node and normalize them into runtime-safe shapes.

Given a node contract (input schema) and raw bindings, you must:
1. Identify which bindings are present and which are missing
2. Detect placeholder-like values ("enter X", "select Y", empty strings, "placeholder")
3. Coerce types where possible (string "123" -> number 123, "true" -> boolean true)
4. Propose defaults for missing optional fields based on the contract
5. Flag required fields that cannot be inferred
6. Normalize asset references into consistent formats

Rules:
- NEVER invent values for required fields \u2014 only flag them as missing
- For optional fields with obvious defaults (e.g., quality=1080, format="mp4"), propose the default
- Detect and clear placeholder strings
- Preserve user-provided values that are already valid

Respond in JSON:
{
  "fields": [
    {
      "key": "string",
      "originalValue": "any",
      "normalizedValue": "any",
      "action": "kept | coerced | defaulted | cleared | inferred",
      "reason": "string | null"
    }
  ],
  "missingRequired": ["string \u2014 keys of required fields that are missing"],
  "warnings": ["string \u2014 warnings about the normalization"],
  "confidence": 0.0-1.0
}`;
async function intelligentNormalizeBindings(input, backend) {
  const userPrompt = buildNormalizerPrompt(input);
  try {
    const completion = await backend.complete({
      systemPrompt: NORMALIZER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.1,
      maxTokens: 2048,
      responseFormat: "json"
    });
    const parsed = parseJsonSafe2(completion.text);
    if (parsed) {
      return toNormalizationResult(parsed, input);
    }
  } catch {
  }
  return buildDeterministicNormalization(input);
}
function buildDeterministicNormalization(input) {
  const { rawBindings, contract } = input;
  const fields = [];
  const missingRequired = [];
  const warnings = [];
  const normalizedBindings = {};
  for (const field of contract.inputs) {
    const rawValue = rawBindings[field.key];
    const hasValue = field.key in rawBindings;
    if (!hasValue) {
      if (field.required) {
        missingRequired.push(field.key);
        fields.push({
          key: field.key,
          originalValue: void 0,
          normalizedValue: void 0,
          action: "cleared",
          reason: `Required field "${field.label}" is not provided.`
        });
      } else if (field.defaultValue !== void 0 && field.defaultValue !== null && field.defaultValue !== "") {
        normalizedBindings[field.key] = field.defaultValue;
        fields.push({
          key: field.key,
          originalValue: void 0,
          normalizedValue: field.defaultValue,
          action: "defaulted",
          reason: `Using contract default for "${field.label}".`
        });
      }
      continue;
    }
    if (isPlaceholderValue(rawValue)) {
      if (field.required) {
        missingRequired.push(field.key);
        warnings.push(`"${field.label}" contains a placeholder value and is required.`);
      }
      fields.push({
        key: field.key,
        originalValue: rawValue,
        normalizedValue: field.defaultValue ?? "",
        action: "cleared",
        reason: "Placeholder value detected and cleared."
      });
      normalizedBindings[field.key] = field.defaultValue ?? "";
      continue;
    }
    const coerced = coerceToFieldType(rawValue, field.type);
    if (coerced !== rawValue) {
      normalizedBindings[field.key] = coerced;
      fields.push({
        key: field.key,
        originalValue: rawValue,
        normalizedValue: coerced,
        action: "coerced",
        reason: `Coerced from ${typeof rawValue} to ${field.type}.`
      });
    } else {
      normalizedBindings[field.key] = rawValue;
      fields.push({
        key: field.key,
        originalValue: rawValue,
        normalizedValue: rawValue,
        action: "kept"
      });
    }
  }
  for (const [key, value] of Object.entries(rawBindings)) {
    if (contract.inputs.some((i) => i.key === key))
      continue;
    normalizedBindings[key] = value;
    fields.push({
      key,
      originalValue: value,
      normalizedValue: value,
      action: "kept",
      reason: "Extra binding not in contract \u2014 passed through."
    });
  }
  return {
    normalizedBindings,
    fields,
    missingRequired,
    warnings,
    confidence: 1
  };
}
function isPlaceholderValue(value) {
  if (typeof value !== "string")
    return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized)
    return true;
  return normalized.startsWith("enter ") || normalized.startsWith("select ") || normalized === "placeholder" || normalized === "todo" || normalized === "tbd" || normalized === "n/a" || normalized === "none" || normalized === "your_" || normalized.startsWith("your_") || normalized.startsWith("<") && normalized.endsWith(">");
}
function coerceToFieldType(value, targetType) {
  if (targetType === "number" && typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !Number.isNaN(Number(trimmed))) {
      return Number(trimmed);
    }
  }
  if (targetType === "boolean" && typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1")
      return true;
    if (lower === "false" || lower === "no" || lower === "0")
      return false;
  }
  if (targetType === "array" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed))
        return parsed;
    } catch {
    }
  }
  if (targetType === "object" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed;
    } catch {
    }
  }
  return value;
}
function buildNormalizerPrompt(input) {
  const { nodeSlug, rawBindings, contract, userIntent, executionMode } = input;
  const sections = [
    `Node Slug: ${nodeSlug}`,
    `Execution Mode: ${executionMode ?? "hosted"}`
  ];
  if (userIntent) {
    sections.push(`User Intent: ${userIntent}`);
  }
  sections.push("", "Contract Inputs:");
  for (const field of contract.inputs) {
    sections.push(
      `  - ${field.key} (${field.type}): ${field.required ? "REQUIRED" : "optional"}` + (field.defaultValue !== void 0 && field.defaultValue !== null && field.defaultValue !== "" ? ` [default: ${JSON.stringify(field.defaultValue)}]` : "")
    );
  }
  sections.push("", "Raw Bindings:");
  for (const [key, value] of Object.entries(rawBindings)) {
    sections.push(`  - ${key}: ${JSON.stringify(value)}`);
  }
  return sections.join("\n");
}
function toNormalizationResult(raw, input) {
  const normalizedBindings = {};
  const fields = [];
  if (Array.isArray(raw.fields)) {
    for (const f of raw.fields) {
      if (typeof f.key !== "string")
        continue;
      const action = validateAction(f.action);
      normalizedBindings[f.key] = f.normalizedValue ?? f.originalValue ?? input.rawBindings[f.key];
      fields.push({
        key: f.key,
        originalValue: f.originalValue ?? input.rawBindings[f.key],
        normalizedValue: f.normalizedValue ?? f.originalValue ?? input.rawBindings[f.key],
        action,
        reason: typeof f.reason === "string" ? f.reason : void 0
      });
    }
  }
  for (const [key, value] of Object.entries(input.rawBindings)) {
    if (!(key in normalizedBindings)) {
      normalizedBindings[key] = value;
    }
  }
  return {
    normalizedBindings,
    fields,
    missingRequired: Array.isArray(raw.missingRequired) ? raw.missingRequired : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5
  };
}
function validateAction(action) {
  const valid = ["kept", "coerced", "defaulted", "cleared", "inferred"];
  if (typeof action === "string" && valid.includes(action)) {
    return action;
  }
  return "kept";
}
function parseJsonSafe2(text63) {
  try {
    const trimmed = text63.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    }
    return null;
  } catch {
    return null;
  }
}

// src/runtime/native-intelligence/recommender.ts
var RECOMMENDER_SYSTEM_PROMPT = `You are a workflow recommendation engine for the Growthub platform.
Given a user's task intent, you decide the best path forward:

1. "reuse-existing" \u2014 if a saved workflow closely matches the intent
2. "start-from-template" \u2014 if a known node contract/template is a good starting point
3. "synthesize-new" \u2014 if no existing workflow or template fits well

You receive:
- The user's task description/intent
- A list of saved workflows (with names, node slugs, lifecycle labels)
- A list of available CMS node contracts

Your recommendation must:
- Pick the best strategy and explain why
- Provide 1-2 alternatives when possible
- Reference specific workflow IDs, names, or node slugs
- Consider lifecycle labels (canonical > experimental > archived)
- Be honest about confidence level

Respond in JSON:
{
  "topRecommendation": {
    "strategy": "reuse-existing | start-from-template | synthesize-new",
    "workflowId": "string | null \u2014 for reuse-existing",
    "workflowName": "string | null \u2014 for reuse-existing",
    "templateSlug": "string | null \u2014 for start-from-template",
    "reason": "string \u2014 why this is recommended",
    "confidence": 0.0-1.0
  },
  "alternatives": [
    {
      "strategy": "...",
      "workflowId": "string | null",
      "workflowName": "string | null",
      "templateSlug": "string | null",
      "reason": "string",
      "confidence": 0.0-1.0
    }
  ],
  "explanation": "string \u2014 overall recommendation rationale"
}`;
async function recommendWorkflow(input, backend) {
  const userPrompt = buildRecommenderPrompt(input);
  try {
    const completion = await backend.complete({
      systemPrompt: RECOMMENDER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 2048,
      responseFormat: "json"
    });
    const parsed = parseJsonSafe3(completion.text);
    if (parsed) {
      return validateRecommendationResult(parsed, input);
    }
  } catch {
  }
  return buildDeterministicRecommendation(input);
}
function buildDeterministicRecommendation(input) {
  const { userIntent, savedWorkflows, availableContracts } = input;
  const intentLower = userIntent.toLowerCase();
  const intentTokens = intentLower.split(/\s+/).filter((t) => t.length > 2);
  const scoredWorkflows = savedWorkflows.filter((w) => w.label !== "archived").map((w) => ({
    workflow: w,
    score: scoreWorkflowMatch(w, intentTokens, intentLower)
  })).sort((a, b) => b.score - a.score);
  const scoredContracts = availableContracts.map((c) => ({
    contract: c,
    score: scoreContractMatch(c, intentTokens, intentLower)
  })).sort((a, b) => b.score - a.score);
  const bestWorkflow = scoredWorkflows[0];
  const bestContract = scoredContracts[0];
  const alternatives = [];
  if (bestWorkflow && bestWorkflow.score >= 3) {
    const topRecommendation = {
      strategy: "reuse-existing",
      workflowId: bestWorkflow.workflow.workflowId,
      workflowName: bestWorkflow.workflow.name,
      reason: `Saved workflow "${bestWorkflow.workflow.name}" matches your intent with ${bestWorkflow.workflow.nodeCount} node(s): ${bestWorkflow.workflow.nodeSlugs.join(", ")}.`,
      confidence: Math.min(0.9, bestWorkflow.score / 10)
    };
    if (bestContract && bestContract.score >= 2) {
      alternatives.push({
        strategy: "start-from-template",
        templateSlug: bestContract.contract.slug,
        reason: `Contract "${bestContract.contract.displayName}" could serve as a starting point for a new pipeline.`,
        confidence: Math.min(0.7, bestContract.score / 10)
      });
    }
    alternatives.push({
      strategy: "synthesize-new",
      reason: "Build a custom pipeline if the existing workflow doesn't fully match your needs.",
      confidence: 0.3
    });
    return {
      topRecommendation,
      alternatives,
      explanation: `Found ${scoredWorkflows.filter((w) => w.score >= 2).length} potentially matching saved workflow(s). "${bestWorkflow.workflow.name}" is the closest match.`
    };
  }
  if (bestContract && bestContract.score >= 2) {
    const topRecommendation = {
      strategy: "start-from-template",
      templateSlug: bestContract.contract.slug,
      reason: `Contract "${bestContract.contract.displayName}" (${bestContract.contract.family}) is a good starting point for your task.`,
      confidence: Math.min(0.7, bestContract.score / 10)
    };
    if (scoredWorkflows.length > 0 && bestWorkflow && bestWorkflow.score >= 1) {
      alternatives.push({
        strategy: "reuse-existing",
        workflowId: bestWorkflow.workflow.workflowId,
        workflowName: bestWorkflow.workflow.name,
        reason: `Existing workflow "${bestWorkflow.workflow.name}" might partially match \u2014 review before reusing.`,
        confidence: Math.min(0.5, bestWorkflow.score / 10)
      });
    }
    alternatives.push({
      strategy: "synthesize-new",
      reason: "Compose a multi-node pipeline from available contracts.",
      confidence: 0.4
    });
    return {
      topRecommendation,
      alternatives,
      explanation: `No strong saved workflow match found. "${bestContract.contract.displayName}" is the best contract starting point.`
    };
  }
  return {
    topRecommendation: {
      strategy: "synthesize-new",
      reason: "No strong match found in saved workflows or available templates. A custom pipeline is recommended.",
      confidence: 0.5
    },
    alternatives: savedWorkflows.length > 0 && bestWorkflow ? [{
      strategy: "reuse-existing",
      workflowId: bestWorkflow.workflow.workflowId,
      workflowName: bestWorkflow.workflow.name,
      reason: `"${bestWorkflow.workflow.name}" is the closest existing workflow, but may need significant modification.`,
      confidence: Math.min(0.3, (bestWorkflow.score || 0) / 10)
    }] : [],
    explanation: "No strong matches found. Recommending a custom pipeline synthesis."
  };
}
function scoreWorkflowMatch(workflow, intentTokens, intentLower) {
  let score = 0;
  const nameLower = workflow.name.toLowerCase();
  const descLower = (workflow.description ?? "").toLowerCase();
  const slugsLower = workflow.nodeSlugs.map((s) => s.toLowerCase()).join(" ");
  for (const token of intentTokens) {
    if (nameLower.includes(token))
      score += 2;
    if (descLower.includes(token))
      score += 1;
    if (slugsLower.includes(token))
      score += 1.5;
  }
  for (const slug of workflow.nodeSlugs) {
    if (intentLower.includes(slug.toLowerCase())) {
      score += 2;
    }
  }
  if (workflow.label === "canonical")
    score += 2;
  if (workflow.label === "experimental")
    score += 0.5;
  if (workflow.label === "archived")
    score -= 3;
  if (workflow.versionCount >= 3)
    score += 1;
  return score;
}
function scoreContractMatch(contract, intentTokens, intentLower) {
  let score = 0;
  const slugLower = contract.slug.toLowerCase();
  const nameLower = contract.displayName.toLowerCase();
  const familyLower = contract.family.toLowerCase();
  for (const token of intentTokens) {
    if (slugLower.includes(token))
      score += 2;
    if (nameLower.includes(token))
      score += 2;
    if (familyLower.includes(token))
      score += 1;
  }
  for (const outputType of contract.outputTypes) {
    if (intentLower.includes(outputType.toLowerCase())) {
      score += 1.5;
    }
  }
  return score;
}
function buildRecommenderPrompt(input) {
  const { userIntent, savedWorkflows, availableContracts, executionMode } = input;
  const sections = [
    `User Intent: ${userIntent}`,
    `Execution Mode: ${executionMode ?? "hosted"}`,
    "",
    `Saved Workflows (${savedWorkflows.length}):`
  ];
  for (const wf of savedWorkflows.slice(0, 30)) {
    sections.push(
      `  - [${wf.workflowId}] "${wf.name}" (${wf.label ?? "unlabeled"}) \u2014 ${wf.nodeCount} node(s): ${wf.nodeSlugs.join(", ")} \u2014 v${wf.versionCount}`
    );
  }
  sections.push("", `Available Contracts (${availableContracts.length}):`);
  for (const contract of availableContracts.slice(0, 30)) {
    sections.push(
      `  - ${contract.slug} "${contract.displayName}" (${contract.family}) \u2014 outputs: [${contract.outputTypes.join(",")}]`
    );
  }
  return sections.join("\n");
}
function validateRecommendationResult(raw, input) {
  return {
    topRecommendation: validateRecommendation(raw.topRecommendation, input),
    alternatives: Array.isArray(raw.alternatives) ? raw.alternatives.map((alt) => validateRecommendation(alt, input)) : [],
    explanation: typeof raw.explanation === "string" ? raw.explanation : "Recommendation generated."
  };
}
function validateRecommendation(raw, input) {
  const strategy = validateStrategy(raw?.strategy);
  return {
    strategy,
    workflowId: typeof raw?.workflowId === "string" ? raw.workflowId : void 0,
    workflowName: typeof raw?.workflowName === "string" ? raw.workflowName : void 0,
    templateSlug: typeof raw?.templateSlug === "string" ? raw.templateSlug : void 0,
    reason: typeof raw?.reason === "string" ? raw.reason : "No specific reason provided.",
    confidence: typeof raw?.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5
  };
}
function validateStrategy(strategy) {
  const valid = ["reuse-existing", "start-from-template", "synthesize-new"];
  if (typeof strategy === "string" && valid.includes(strategy)) {
    return strategy;
  }
  return "synthesize-new";
}
function parseJsonSafe3(text63) {
  try {
    const trimmed = text63.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    }
    return null;
  } catch {
    return null;
  }
}

// src/runtime/native-intelligence/planner.ts
var PLANNER_SYSTEM_PROMPT = `You are a workflow graph planner for the Growthub platform.
Your job is to propose a pipeline graph (sequence of CMS nodes) that fulfills the user's intent.

You receive:
- The user's intent/goal
- Available CMS node contracts (with slugs, input schemas, output types, families)
- Optionally, existing saved workflows that might already fulfill the need

Rules:
1. Only use node slugs that exist in the available contracts list
2. Propose realistic bindings \u2014 use empty strings for values the user must provide
3. Chain nodes by specifying upstream dependencies when outputs feed into downstream inputs
4. Respect constraints (max nodes, required output types, preferred families)
5. If an existing workflow already matches well, recommend it instead of planning a new graph
6. Keep graphs minimal \u2014 prefer fewer nodes that accomplish the goal
7. NEVER propose nodes that don't exist in the available contracts

Respond in JSON:
{
  "proposedNodes": [
    {
      "slug": "string \u2014 must be from available contracts",
      "displayName": "string",
      "reason": "string \u2014 why this node is needed",
      "suggestedBindings": { "key": "value or empty string" },
      "upstreamNodeSlugs": ["string \u2014 slugs of upstream nodes, if any"]
    }
  ],
  "explanation": "string \u2014 overall plan rationale",
  "alternativeExistingWorkflowId": "string | null",
  "alternativeExistingWorkflowReason": "string | null",
  "confidence": 0.0-1.0,
  "warnings": ["string"]
}`;
async function planWorkflow(input, backend) {
  const userPrompt = buildPlannerPrompt(input);
  try {
    const completion = await backend.complete({
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.4,
      maxTokens: 3072,
      responseFormat: "json"
    });
    const parsed = parseJsonSafe4(completion.text);
    if (parsed) {
      return validatePlanningResult(parsed, input);
    }
  } catch {
  }
  return buildDeterministicPlan(input);
}
function buildDeterministicPlan(input) {
  const { userIntent, availableContracts, existingWorkflows, constraints } = input;
  const intentLower = userIntent.toLowerCase();
  const intentTokens = intentLower.split(/\s+/).filter((t) => t.length > 2);
  const existingMatch = findBestExistingWorkflow(existingWorkflows ?? [], intentTokens, intentLower);
  const scoredContracts = availableContracts.map((c) => ({ contract: c, score: scoreContract(c, intentTokens, intentLower, constraints) })).sort((a, b) => b.score - a.score);
  const maxNodes = constraints?.maxNodes ?? 5;
  const requiredOutputs = new Set(constraints?.requiredOutputTypes ?? []);
  const selectedNodes = [];
  const usedSlugs = /* @__PURE__ */ new Set();
  const warnings = [];
  for (const { contract, score } of scoredContracts) {
    if (selectedNodes.length >= maxNodes)
      break;
    if (score <= 0)
      break;
    if (usedSlugs.has(contract.slug))
      continue;
    if (constraints?.avoidSlugs?.includes(contract.slug))
      continue;
    const suggestedBindings = {};
    for (const field of contract.inputs) {
      suggestedBindings[field.key] = field.defaultValue ?? "";
    }
    const upstreamSlugs = [];
    if (selectedNodes.length > 0) {
      const lastNode = selectedNodes[selectedNodes.length - 1];
      const lastContract = availableContracts.find((c) => c.slug === lastNode.slug);
      if (lastContract && hasOutputInputOverlap(lastContract, contract)) {
        upstreamSlugs.push(lastNode.slug);
      }
    }
    selectedNodes.push({
      slug: contract.slug,
      displayName: contract.displayName,
      reason: `Matches intent tokens and produces ${contract.outputTypes.join(", ") || "general"} output.`,
      suggestedBindings,
      upstreamNodeSlugs: upstreamSlugs.length > 0 ? upstreamSlugs : void 0
    });
    usedSlugs.add(contract.slug);
    for (const outType of contract.outputTypes) {
      requiredOutputs.delete(outType);
    }
  }
  if (requiredOutputs.size > 0) {
    warnings.push(`Could not find contracts producing required output types: ${[...requiredOutputs].join(", ")}.`);
  }
  if (selectedNodes.length === 0) {
    warnings.push("No contracts matched the user intent. Consider refining the task description.");
    return {
      proposedNodes: [],
      explanation: "No matching contracts found for the given intent.",
      confidence: 0.1,
      warnings
    };
  }
  return {
    proposedNodes: selectedNodes,
    explanation: `Proposed ${selectedNodes.length}-node pipeline using ${selectedNodes.map((n) => n.slug).join(" -> ")}.`,
    alternativeExistingWorkflowId: existingMatch?.workflowId,
    alternativeExistingWorkflowReason: existingMatch ? `Existing workflow "${existingMatch.name}" may already fulfill this intent.` : void 0,
    confidence: Math.min(0.7, selectedNodes.length > 0 ? scoredContracts[0].score / 10 : 0.1),
    warnings
  };
}
function scoreContract(contract, intentTokens, intentLower, constraints) {
  let score = 0;
  const slugLower = contract.slug.toLowerCase();
  const nameLower = contract.displayName.toLowerCase();
  const familyLower = contract.family.toLowerCase();
  for (const token of intentTokens) {
    if (slugLower.includes(token))
      score += 2;
    if (nameLower.includes(token))
      score += 2;
    if (familyLower.includes(token))
      score += 1;
  }
  if (constraints?.requiredOutputTypes) {
    for (const requiredType of constraints.requiredOutputTypes) {
      if (contract.outputTypes.includes(requiredType))
        score += 3;
    }
  }
  if (constraints?.preferredFamilies) {
    if (constraints.preferredFamilies.includes(contract.family))
      score += 2;
  }
  for (const outType of contract.outputTypes) {
    if (intentLower.includes(outType.toLowerCase()))
      score += 1.5;
  }
  return score;
}
function findBestExistingWorkflow(workflows, intentTokens, intentLower) {
  let best = null;
  let bestScore = 0;
  for (const wf of workflows) {
    if (wf.label === "archived")
      continue;
    let score = 0;
    const nameLower = wf.name.toLowerCase();
    const slugsLower = wf.nodeSlugs.join(" ").toLowerCase();
    for (const token of intentTokens) {
      if (nameLower.includes(token))
        score += 2;
      if (slugsLower.includes(token))
        score += 1.5;
    }
    if (wf.label === "canonical")
      score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = wf;
    }
  }
  return bestScore >= 3 ? best : null;
}
function hasOutputInputOverlap(upstream, downstream) {
  const outputTypes = new Set(upstream.outputTypes.map((t) => t.toLowerCase()));
  for (const input of downstream.inputs) {
    const keyLower = input.key.toLowerCase();
    for (const outType of outputTypes) {
      if (keyLower.includes(outType) || outType.includes(keyLower)) {
        return true;
      }
    }
  }
  return false;
}
function buildPlannerPrompt(input) {
  const { userIntent, availableContracts, existingWorkflows, executionMode, constraints } = input;
  const sections = [
    `User Intent: ${userIntent}`,
    `Execution Mode: ${executionMode ?? "hosted"}`
  ];
  if (constraints) {
    sections.push("", "Constraints:");
    if (constraints.maxNodes)
      sections.push(`  Max Nodes: ${constraints.maxNodes}`);
    if (constraints.requiredOutputTypes?.length) {
      sections.push(`  Required Output Types: ${constraints.requiredOutputTypes.join(", ")}`);
    }
    if (constraints.preferredFamilies?.length) {
      sections.push(`  Preferred Families: ${constraints.preferredFamilies.join(", ")}`);
    }
    if (constraints.avoidSlugs?.length) {
      sections.push(`  Avoid Slugs: ${constraints.avoidSlugs.join(", ")}`);
    }
  }
  sections.push("", `Available Contracts (${availableContracts.length}):`);
  for (const contract of availableContracts.slice(0, 40)) {
    const inputs = contract.inputs.map((i) => `${i.key}:${i.type}${i.required ? "*" : ""}`).join(", ");
    sections.push(
      `  - ${contract.slug} "${contract.displayName}" (${contract.family}) \u2014 inputs=[${inputs}], outputs=[${contract.outputTypes.join(",")}], strategy=${contract.executionStrategy}`
    );
  }
  if (existingWorkflows && existingWorkflows.length > 0) {
    sections.push("", `Existing Workflows (${existingWorkflows.length}):`);
    for (const wf of existingWorkflows.slice(0, 20)) {
      sections.push(
        `  - [${wf.workflowId}] "${wf.name}" (${wf.label ?? "unlabeled"}) \u2014 nodes: ${wf.nodeSlugs.join(", ")} \u2014 v${wf.versionCount}`
      );
    }
  }
  return sections.join("\n");
}
function validatePlanningResult(raw, input) {
  const availableSlugs = new Set(input.availableContracts.map((c) => c.slug));
  const proposedNodes = [];
  const warnings = Array.isArray(raw.warnings) ? [...raw.warnings] : [];
  if (Array.isArray(raw.proposedNodes)) {
    for (const node of raw.proposedNodes) {
      if (typeof node.slug !== "string")
        continue;
      if (!availableSlugs.has(node.slug)) {
        warnings.push(`Proposed node slug "${node.slug}" is not in the available contracts \u2014 skipped.`);
        continue;
      }
      proposedNodes.push({
        slug: node.slug,
        displayName: typeof node.displayName === "string" ? node.displayName : node.slug,
        reason: typeof node.reason === "string" ? node.reason : "Selected by planner.",
        suggestedBindings: node.suggestedBindings && typeof node.suggestedBindings === "object" ? node.suggestedBindings : {},
        upstreamNodeSlugs: Array.isArray(node.upstreamNodeSlugs) ? node.upstreamNodeSlugs : void 0
      });
    }
  }
  return {
    proposedNodes,
    explanation: typeof raw.explanation === "string" ? raw.explanation : "Plan generated.",
    alternativeExistingWorkflowId: typeof raw.alternativeExistingWorkflowId === "string" ? raw.alternativeExistingWorkflowId : void 0,
    alternativeExistingWorkflowReason: typeof raw.alternativeExistingWorkflowReason === "string" ? raw.alternativeExistingWorkflowReason : void 0,
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
    warnings
  };
}
function parseJsonSafe4(text63) {
  try {
    const trimmed = text63.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    }
    return null;
  } catch {
    return null;
  }
}

// src/runtime/native-intelligence/index.ts
function resolveConfigPath2() {
  return path28.resolve(resolvePaperclipHomeDir(), "native-intelligence", "config.json");
}
function readIntelligenceConfig() {
  const configPath = resolveConfigPath2();
  if (!fs20.existsSync(configPath)) {
    return { ...DEFAULT_INTELLIGENCE_CONFIG };
  }
  try {
    const raw = JSON.parse(fs20.readFileSync(configPath, "utf-8"));
    return {
      modelId: validateModelId(raw.modelId),
      backendType: raw.backendType === "hosted" ? "hosted" : "local",
      endpoint: typeof raw.endpoint === "string" ? raw.endpoint : DEFAULT_INTELLIGENCE_CONFIG.endpoint,
      localModel: typeof raw.localModel === "string" ? raw.localModel : void 0,
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : void 0,
      defaultTemperature: typeof raw.defaultTemperature === "number" ? raw.defaultTemperature : DEFAULT_INTELLIGENCE_CONFIG.defaultTemperature,
      defaultMaxTokens: typeof raw.defaultMaxTokens === "number" ? raw.defaultMaxTokens : DEFAULT_INTELLIGENCE_CONFIG.defaultMaxTokens,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_INTELLIGENCE_CONFIG.timeoutMs
    };
  } catch {
    return { ...DEFAULT_INTELLIGENCE_CONFIG };
  }
}
function writeIntelligenceConfig(config) {
  const configPath = resolveConfigPath2();
  fs20.mkdirSync(path28.dirname(configPath), { recursive: true });
  fs20.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}
`, "utf-8");
}
function validateModelId(id) {
  if (id === "gemma3" || id === "gemma3n" || id === "codegemma")
    return id;
  return "gemma3";
}
function createNativeIntelligenceProvider(configOverride) {
  const config = { ...readIntelligenceConfig(), ...configOverride };
  const backend = createNativeIntelligenceBackend(config);
  return {
    id: config.modelId,
    async planWorkflow(input) {
      return planWorkflow(input, backend);
    },
    async normalizeBindings(input) {
      return intelligentNormalizeBindings(input, backend);
    },
    async recommendWorkflow(input) {
      return recommendWorkflow(input, backend);
    },
    async summarizeExecution(input) {
      return summarizeExecution2(input, backend);
    }
  };
}

// src/commands/pipeline.ts
init_banner();
function hr4(width = 72) {
  return pc30.dim("\u2500".repeat(width));
}
function stripAnsi4(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}
function box4(lines) {
  const padded = lines.map((l) => "  " + l);
  const width = Math.max(...padded.map((l) => stripAnsi4(l).length)) + 4;
  const top = pc30.dim("\u250C" + "\u2500".repeat(width) + "\u2510");
  const bottom = pc30.dim("\u2514" + "\u2500".repeat(width) + "\u2518");
  const body = padded.map((l) => {
    const pad = width - stripAnsi4(l).length;
    return pc30.dim("\u2502") + l + " ".repeat(pad) + pc30.dim("\u2502");
  });
  return [top, ...body, bottom].join("\n");
}
async function runPipelineAssembler(opts) {
  printPaperclipCliBanner();
  p20.intro(pc30.bold("Dynamic Registry Pipeline Assembler"));
  p20.note(
    [
      "Dynamic pipeline creation flow:",
      "  1) Select capability nodes",
      "  2) Normalize required bindings",
      "  3) Validate graph",
      "  4) Pre-execution contract summary",
      "  5) Save to Saved Workflows",
      "  6) Execute hosted workflow"
    ].join("\n"),
    "Interactive Tree"
  );
  const access = getWorkflowAccess();
  if (access.state !== "ready") {
    p20.note(
      [
        "Dynamic Pipelines are unavailable until the hosted user is linked to this local machine.",
        access.reason
      ].join("\n"),
      "Growthub Local Machine Required"
    );
    return opts.allowBackToHub ? "back" : "done";
  }
  if (opts.allowBackToHub) {
    const entryChoice = await p20.select({
      message: "Dynamic Pipelines (hosted-only)",
      options: [
        { value: "start", label: "Start interactive assembler" },
        { value: "__back_to_hub", label: "\u2190 Back to workflow menu" }
      ]
    });
    if (p20.isCancel(entryChoice)) {
      p20.cancel("Cancelled.");
      process.exit(0);
    }
    if (entryChoice === "__back_to_hub")
      return "back";
  } else {
    p20.note("Execution mode is fixed to hosted for Dynamic Pipelines.", "Hosted only");
  }
  const registry = createCmsCapabilityRegistryClient();
  let capabilities;
  const capabilitiesSpinner = p20.spinner();
  capabilitiesSpinner.start("Loading capability list...");
  try {
    const result = await registry.listCapabilities();
    capabilities = result.nodes;
    capabilitiesSpinner.stop(`Loaded ${capabilities.length} capabilities.`);
  } catch (err) {
    capabilitiesSpinner.stop(pc30.red("Failed to load capabilities."));
    p20.log.error("Failed to load capabilities: " + err.message);
    return "done";
  }
  if (capabilities.length === 0) {
    p20.note("No capabilities available. Ensure you are authenticated.", "Nothing found");
    return "done";
  }
  const builder = createPipelineBuilder({
    executionMode: "hosted"
  });
  while (true) {
    const currentNodes = builder.getNodes();
    const action = await p20.select({
      message: `Pipeline has ${currentNodes.length} node${currentNodes.length !== 1 ? "s" : ""}. What next?`,
      options: [
        { value: "add", label: "\u2795 Add a node", hint: "Select a capability to add" },
        ...currentNodes.length > 0 ? [
          { value: "preview", label: "\u{1F441}\uFE0F  Preview pipeline" },
          { value: "validate", label: "\u2705 Validate pipeline" },
          { value: "save", label: "\u{1F4BE} Save to Saved Workflows" },
          { value: "execute", label: "\u{1F680} Execute pipeline" }
        ] : [],
        {
          value: "cancel",
          label: opts.allowBackToHub ? "\u2190 Back to workflow menu" : "\u2190 Cancel"
        }
      ]
    });
    if (p20.isCancel(action)) {
      p20.cancel("Cancelled.");
      process.exit(0);
    }
    if (action === "cancel") {
      return opts.allowBackToHub ? "back" : "done";
    }
    if (action === "add") {
      const capChoice = await p20.select({
        message: "Select capability to add as pipeline node",
        options: [
          ...capabilities.map((c) => ({
            value: c.slug,
            label: `${pc30.bold(c.displayName)}  ${pc30.dim(c.slug)}`,
            hint: `${c.family} \xB7 ${c.executionKind}`
          })),
          { value: "__back", label: "\u2190 Back" }
        ]
      });
      if (p20.isCancel(capChoice)) {
        p20.cancel("Cancelled.");
        process.exit(0);
      }
      if (capChoice === "__back")
        continue;
      const cap = capabilities.find((c) => c.slug === capChoice);
      if (!cap)
        continue;
      const bindings = {};
      for (const bindingKey of cap.requiredBindings) {
        const value = await p20.text({
          message: `Binding "${bindingKey}" for ${cap.slug}`,
          placeholder: `Enter value for ${bindingKey}`
        });
        if (p20.isCancel(value)) {
          p20.cancel("Cancelled.");
          process.exit(0);
        }
        bindings[bindingKey] = value;
      }
      let upstreamNodeIds;
      if (currentNodes.length > 0) {
        const upstreamChoice = await p20.multiselect({
          message: "Select upstream nodes (outputs feed into this node)",
          options: [
            { value: "__none", label: "(no upstream)" },
            ...currentNodes.map((n) => ({
              value: n.id,
              label: `${n.slug} (${n.id})`
            }))
          ],
          required: false
        });
        if (p20.isCancel(upstreamChoice)) {
          p20.cancel("Cancelled.");
          process.exit(0);
        }
        const selected = upstreamChoice.filter((v) => v !== "__none");
        if (selected.length > 0) {
          upstreamNodeIds = selected;
        }
      }
      const normalizedBindings = normalizeNodeBindings(bindings, cap);
      const nodeId = builder.addNode(capChoice, normalizedBindings.bindings, upstreamNodeIds);
      p20.log.success(`Added node ${pc30.bold(cap.displayName)} (${pc30.dim(nodeId)})`);
      continue;
    }
    if (action === "preview") {
      const pipeline = builder.build();
      console.log("");
      console.log(box4([
        `${pc30.bold("Pipeline:")} ${pipeline.pipelineId}`,
        `${pc30.dim("Mode:")} ${pipeline.executionMode}  ${pc30.dim("Nodes:")} ${pipeline.nodes.length}`,
        "",
        ...pipeline.nodes.map((n, i) => {
          const upstream = n.upstreamNodeIds?.length ? pc30.dim(` \u2190 ${n.upstreamNodeIds.join(", ")}`) : "";
          return `${pc30.dim(String(i + 1) + ".")} ${pc30.bold(n.slug)} ${pc30.dim(n.id)}${upstream}`;
        })
      ]));
      console.log("");
      continue;
    }
    if (action === "validate") {
      try {
        const result = await builder.validate();
        if (result.valid) {
          p20.log.success("Pipeline is valid.");
        } else {
          p20.log.error("Pipeline validation failed.");
        }
        for (const issue of result.issues) {
          const prefix = issue.severity === "error" ? pc30.red("ERROR") : pc30.yellow("WARN");
          const nodeRef = issue.nodeId ? ` [${issue.nodeId}]` : "";
          console.log(`  ${prefix}${nodeRef}: ${issue.message}`);
        }
      } catch (err) {
        p20.log.error("Validation failed: " + err.message);
      }
      continue;
    }
    if (action === "save") {
      const session = readSession();
      if (!session || isSessionExpired(session)) {
        p20.log.error("Hosted session expired. Run `growthub auth login` again.");
        continue;
      }
      const pipeline = builder.build();
      const defaultName = inferWorkflowName(pipeline);
      const workflowName = await p20.text({
        message: "Saved workflow name",
        placeholder: defaultName,
        defaultValue: defaultName
      });
      if (p20.isCancel(workflowName)) {
        p20.cancel("Cancelled.");
        process.exit(0);
      }
      const summary = buildPreExecutionSummary({
        pipeline,
        registryBySlug: new Map(capabilities.map((node) => [node.slug, node]))
      });
      console.log("");
      console.log(box4(renderPreExecutionSummary(summary)));
      console.log("");
      const intelligenceSummary = await renderIntelligenceSummary(
        pipeline,
        capabilities,
        "pre-save"
      );
      if (intelligenceSummary) {
        console.log(box4(intelligenceSummary));
        console.log("");
      }
      const confirmed = await p20.confirm({
        message: `Save hosted workflow "${workflowName}"?`,
        initialValue: true
      });
      if (p20.isCancel(confirmed) || !confirmed)
        continue;
      try {
        const saveResult = await saveHostedWorkflow(session, {
          name: workflowName,
          description: "Saved from Dynamic Pipelines assembler",
          config: compileToHostedWorkflowConfig(pipeline, { workflowName })
        });
        if (!saveResult?.workflowId) {
          throw new Error("Hosted workflow save returned no workflow id.");
        }
        p20.log.success(
          `Saved to workflow registry as ${pc30.bold(workflowName)} (${pc30.dim(saveResult.workflowId)} \xB7 v${saveResult.version}).`
        );
      } catch (err) {
        if (err instanceof HostedEndpointUnavailableError) {
          p20.log.error("Hosted save endpoint is unavailable on this GH app surface.");
        } else {
          p20.log.error("Save failed: " + err.message);
        }
      }
      continue;
    }
    if (action === "execute") {
      const validation = await builder.validate();
      if (!validation.valid) {
        p20.log.error("Pipeline is not valid. Fix errors before executing.");
        for (const issue of validation.issues.filter((i) => i.severity === "error")) {
          console.log(`  ${pc30.red("ERROR")}: ${issue.message}`);
        }
        continue;
      }
      const pipeline = builder.build();
      const summary = buildPreExecutionSummary({
        pipeline,
        registryBySlug: new Map(capabilities.map((node) => [node.slug, node]))
      });
      console.log("");
      console.log(box4(renderPreExecutionSummary(summary)));
      console.log("");
      const intelligenceSummary = await renderIntelligenceSummary(
        pipeline,
        capabilities,
        "pre-execution"
      );
      if (intelligenceSummary) {
        console.log(box4(intelligenceSummary));
        console.log("");
      }
      const confirmed = await p20.confirm({
        message: "Execute this pipeline through the hosted runtime?",
        initialValue: false
      });
      if (p20.isCancel(confirmed) || !confirmed)
        continue;
      try {
        const executionClient = createHostedExecutionClient();
        const pipeline2 = builder.build();
        const pkg = await builder.package();
        p20.log.info(`Executing pipeline ${pc30.bold(pipeline2.pipelineId)} (${pkg.executionRoute})...`);
        const result = await executionClient.executeWorkflow({
          pipelineId: pipeline2.pipelineId,
          threadId: pipeline2.threadId,
          nodes: pipeline2.nodes.map((n) => ({
            nodeId: n.id,
            slug: n.slug,
            bindings: n.bindings,
            upstreamNodeIds: n.upstreamNodeIds
          })),
          executionMode: pipeline2.executionMode,
          metadata: pipeline2.metadata
        });
        p20.log.success(`Execution ${pc30.bold(result.executionId)}: ${result.status}`);
        const artifactStore = createArtifactStore();
        for (const artRef of result.artifacts) {
          const nodeResult = result.nodeResults[artRef.nodeId];
          artifactStore.create({
            artifactType: artRef.artifactType,
            sourceNodeSlug: nodeResult?.slug ?? "unknown",
            executionContext: pipeline2.executionMode === "local" ? "local" : "hosted",
            pipelineId: pipeline2.pipelineId,
            nodeId: artRef.nodeId,
            threadId: pipeline2.threadId,
            metadata: artRef.metadata ?? {}
          });
        }
        if (result.artifacts.length > 0) {
          p20.log.info(`${result.artifacts.length} artifact(s) recorded.`);
        }
      } catch (err) {
        p20.log.error("Execution failed: " + err.message);
      }
      continue;
    }
  }
}
function loadPipelineFromFileOrJson(input) {
  const resolvedPath = path29.resolve(input);
  if (fs21.existsSync(resolvedPath)) {
    const content = fs21.readFileSync(resolvedPath, "utf-8");
    return deserializePipeline(JSON.parse(content));
  }
  try {
    return deserializePipeline(JSON.parse(input));
  } catch {
    throw new Error(
      `"${input}" is not a valid file path or JSON string. Provide a path to a pipeline JSON file or inline JSON.`
    );
  }
}
function renderExecutionProgress(completed, total, detail) {
  if (!process.stdout.isTTY)
    return;
  const width = 24;
  const safeCompleted = Math.max(0, Math.min(completed, total));
  const percent = total <= 0 ? 0 : Math.round(safeCompleted / total * 100);
  const filled = Math.max(0, Math.min(width, Math.round(percent / 100 * width)));
  const bar = `${"=".repeat(filled)}${"-".repeat(width - filled)}`;
  const line = `\r${pc30.cyan("Workflow run")} ${pc30.dim("[")}${pc30.green(bar)}${pc30.dim("]")} ${String(percent).padStart(3)}% ${pc30.dim(detail)}`;
  process.stdout.write(line);
  if (safeCompleted >= total) {
    process.stdout.write("\n");
  }
}
async function executeHostedPipeline(pipeline, opts) {
  const executionClient = createHostedExecutionClient();
  const session = readSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Hosted session expired. Run `growthub auth login` again.");
  }
  let hostedWorkflowId = typeof pipeline.metadata?.hostedWorkflowId === "string" ? pipeline.metadata.hostedWorkflowId : void 0;
  try {
    const saveResult = await saveHostedWorkflow(session, {
      workflowId: hostedWorkflowId,
      name: typeof pipeline.metadata?.workflowName === "string" ? pipeline.metadata.workflowName : inferWorkflowName(pipeline),
      description: typeof pipeline.metadata?.description === "string" ? pipeline.metadata.description : "",
      config: compileToHostedWorkflowConfig(pipeline)
    });
    hostedWorkflowId = saveResult?.workflowId ?? hostedWorkflowId;
  } catch (err) {
    if (!(err instanceof HostedEndpointUnavailableError)) {
      throw err;
    }
  }
  let completedNodes = 0;
  const totalNodes = Math.max(1, pipeline.nodes.length);
  const completed = /* @__PURE__ */ new Set();
  const trackableNodeIds = new Set(pipeline.nodes.map((node) => node.id));
  const startupSpinner = opts?.json ? null : p20.spinner();
  let startupSettled = false;
  startupSpinner?.start("Preparing hosted workflow execution...");
  const settleStartup = (message) => {
    if (!startupSpinner || startupSettled)
      return;
    startupSettled = true;
    startupSpinner.stop(message ?? "Hosted workflow execution started.");
  };
  const result = await executionClient.executeWorkflow({
    pipelineId: pipeline.pipelineId,
    workflowId: hostedWorkflowId,
    threadId: hostedWorkflowId ?? pipeline.threadId,
    nodes: pipeline.nodes.map((n) => ({
      nodeId: n.id,
      slug: n.slug,
      bindings: n.bindings,
      upstreamNodeIds: n.upstreamNodeIds
    })),
    executionMode: pipeline.executionMode,
    metadata: pipeline.metadata
  }, opts?.json ? void 0 : {
    onEvent: async (event) => {
      if (event.type === "node_start" || event.type === "node_complete") {
        settleStartup("Hosted workflow execution started.");
      }
      if (event.type === "node_complete" && event.nodeId && trackableNodeIds.has(event.nodeId) && !completed.has(event.nodeId)) {
        completed.add(event.nodeId);
        completedNodes = completed.size;
        const node = pipeline.nodes.find((candidate) => candidate.id === event.nodeId);
        renderExecutionProgress(completedNodes, totalNodes, node?.slug ?? event.nodeId);
      }
      if (event.type === "error") {
        settleStartup("Hosted workflow execution started.");
        renderExecutionProgress(totalNodes, totalNodes, "failed");
      }
    }
  });
  settleStartup("Hosted workflow execution started.");
  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("");
  console.log(pc30.bold("Pipeline Execution Result"));
  console.log(hr4());
  console.log(`  ${pc30.dim("Execution ID:")} ${result.executionId}`);
  if (result.threadId)
    console.log(`  ${pc30.dim("Thread ID:")}    ${result.threadId}`);
  console.log(`  ${pc30.dim("Status:")}       ${result.status === "succeeded" ? pc30.green(result.status) : pc30.red(result.status)}`);
  if (result.startedAt)
    console.log(`  ${pc30.dim("Started:")}      ${result.startedAt}`);
  if (result.completedAt)
    console.log(`  ${pc30.dim("Completed:")}    ${result.completedAt}`);
  console.log(hr4());
  for (const [nodeId, nodeResult] of Object.entries(result.nodeResults)) {
    const statusColor3 = nodeResult.status === "succeeded" ? pc30.green : pc30.red;
    console.log(`  ${statusColor3(nodeResult.status)} ${pc30.bold(nodeResult.slug)} (${pc30.dim(nodeId)})`);
    if (nodeResult.error) {
      console.log(`    ${pc30.red(nodeResult.error)}`);
    }
  }
  if (result.artifacts.length > 0) {
    console.log("");
    console.log(pc30.bold("  Artifacts:"));
    for (const art of result.artifacts) {
      console.log(`    ${pc30.dim("\xB7")} ${art.artifactType} (${art.artifactId})`);
    }
  }
  if (result.summary) {
    console.log("");
    console.log(pc30.bold("  Summary:"));
    if (result.summary.outputText)
      console.log(`    ${pc30.dim("\xB7")} ${result.summary.outputText}`);
    if (typeof result.summary.imageCount === "number")
      console.log(`    ${pc30.dim("\xB7")} images: ${result.summary.imageCount}`);
    if (typeof result.summary.slideCount === "number")
      console.log(`    ${pc30.dim("\xB7")} slides: ${result.summary.slideCount}`);
    if (typeof result.summary.videoCount === "number")
      console.log(`    ${pc30.dim("\xB7")} videos: ${result.summary.videoCount}`);
    if (result.summary.workflowRunId)
      console.log(`    ${pc30.dim("\xB7")} workflow_run_id: ${result.summary.workflowRunId}`);
    if (result.summary.keyboardShortcutHint)
      console.log(`    ${pc30.dim("\xB7")} ${result.summary.keyboardShortcutHint}`);
  }
  try {
    const credits = await fetchHostedCredits(session);
    if (credits) {
      console.log("");
      console.log(pc30.bold("  Credits:"));
      console.log(`    ${pc30.dim("\xB7")} available: $${credits.totalAvailable.toFixed(2)}`);
      console.log(`    ${pc30.dim("\xB7")} used this period: $${credits.creditsUsedThisPeriod.toFixed(2)} / $${credits.creditsPerMonth.toFixed(2)}`);
    }
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      console.log("");
      console.log(pc30.yellow("  Credits unavailable on this hosted surface."));
    } else {
      throw err;
    }
  }
  const artifactStore = createArtifactStore();
  for (const artRef of result.artifacts) {
    const nodeResult = result.nodeResults[artRef.nodeId];
    artifactStore.create({
      artifactType: artRef.artifactType,
      sourceNodeSlug: nodeResult?.slug ?? "unknown",
      executionContext: pipeline.executionMode === "local" ? "local" : "hosted",
      pipelineId: pipeline.pipelineId,
      nodeId: artRef.nodeId,
      threadId: result.threadId ?? pipeline.threadId,
      metadata: artRef.metadata ?? {}
    });
  }
  console.log("");
}
async function renderIntelligenceSummary(pipeline, capabilities, phase) {
  try {
    const provider = createNativeIntelligenceProvider();
    const registryContext = capabilities.map((cap) => introspectNodeContract(cap));
    const capabilityMap = new Map(capabilities.map((n) => [n.slug, n]));
    const pipelineSummary = {
      pipelineId: pipeline.pipelineId,
      executionMode: pipeline.executionMode,
      nodes: pipeline.nodes.map((node) => {
        const cap = capabilityMap.get(node.slug);
        const contract = cap ? introspectNodeContract(cap) : null;
        const missingRequired = [];
        if (contract) {
          for (const input2 of contract.inputs) {
            if (!input2.required)
              continue;
            const value = node.bindings[input2.key];
            if (value === void 0 || value === null || value === "") {
              missingRequired.push(input2.key);
            }
          }
        }
        return {
          slug: node.slug,
          bindingCount: Object.keys(node.bindings).length,
          missingRequired,
          outputTypes: contract?.outputTypes ?? [],
          assetCount: 0
        };
      }),
      warnings: []
    };
    const input = {
      pipeline: pipelineSummary,
      registryContext,
      phase
    };
    const result = await provider.summarizeExecution(input);
    const lines = [
      `${pc30.bold("Intelligence Summary")} ${pc30.dim(result.title)}`,
      result.explanation
    ];
    if (result.runtimeModeNote) {
      lines.push(`${pc30.dim("Runtime:")} ${result.runtimeModeNote}`);
    }
    if (result.outputExpectation) {
      lines.push(`${pc30.dim("Expected:")} ${result.outputExpectation}`);
    }
    if (result.missingBindingGuidance.length > 0) {
      lines.push("", pc30.yellow("Missing Binding Guidance"));
      for (const guidance of result.missingBindingGuidance) {
        lines.push(`  ${pc30.dim("\xB7")} ${guidance}`);
      }
    }
    if (result.costLatencyCautions.length > 0) {
      lines.push("", pc30.yellow("Cost/Latency Notes"));
      for (const caution of result.costLatencyCautions) {
        lines.push(`  ${pc30.dim("\xB7")} ${caution}`);
      }
    }
    if (result.warnings.length > 0) {
      lines.push("", pc30.yellow("Warnings"));
      for (const warning of result.warnings) {
        lines.push(`  ${pc30.dim("\xB7")} ${warning}`);
      }
    }
    return lines;
  } catch {
    return null;
  }
}
function registerPipelineCommands(program2) {
  const pipe = program2.command("pipeline").description("Assemble, validate, and execute dynamic registry pipelines").addHelpText("after", `
Examples:
  $ growthub pipeline                       # interactive assembler
  $ growthub pipeline assemble              # interactive assembly
  $ growthub pipeline validate ./pipeline.json
  $ growthub pipeline execute ./pipeline.json
`);
  pipe.action(async () => {
    await runPipelineAssembler({});
  });
  pipe.command("assemble").description("Interactively assemble a dynamic registry pipeline").action(async () => {
    await runPipelineAssembler({});
  });
  pipe.command("validate").description("Validate a pipeline from a JSON file or inline JSON").argument("<file-or-json>", "Path to pipeline JSON file or inline JSON string").option("--json", "Output raw JSON").action(async (input, opts) => {
    const access = getWorkflowAccess();
    if (access.state !== "ready") {
      console.error(pc30.red(`${access.reason}.`));
      process.exitCode = 1;
      return;
    }
    try {
      const pipeline = loadPipelineFromFileOrJson(input);
      const builder = createPipelineBuilder({
        executionMode: pipeline.executionMode,
        threadId: pipeline.threadId,
        metadata: pipeline.metadata
      });
      for (const node of pipeline.nodes) {
        builder.addNode(node.slug, node.bindings, node.upstreamNodeIds);
      }
      const result = await builder.validate();
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (result.valid) {
        console.log(pc30.green(pc30.bold("Pipeline is valid.")));
      } else {
        console.log(pc30.red(pc30.bold("Pipeline validation failed.")));
      }
      for (const issue of result.issues) {
        const prefix = issue.severity === "error" ? pc30.red("  ERROR") : pc30.yellow("  WARN");
        const nodeRef = issue.nodeId ? ` [${issue.nodeId}]` : "";
        console.log(`${prefix}${nodeRef}: ${issue.message}`);
      }
      if (!result.valid)
        process.exitCode = 1;
    } catch (err) {
      console.error(pc30.red("Validation failed: " + err.message));
      process.exitCode = 1;
    }
  });
  pipe.command("execute").description("Execute a pipeline from a JSON file or inline JSON").argument("<file-or-json>", "Path to pipeline JSON file or inline JSON string").option("--json", "Output raw JSON").action(async (input, opts) => {
    const access = getWorkflowAccess();
    if (access.state !== "ready") {
      console.error(pc30.red(`${access.reason}.`));
      process.exitCode = 1;
      return;
    }
    try {
      const pipeline = loadPipelineFromFileOrJson(input);
      if (!opts.json) {
        const registry = createCmsCapabilityRegistryClient();
        const { nodes: capabilities } = await registry.listCapabilities({ enabledOnly: false });
        const summary = buildPreExecutionSummary({
          pipeline,
          registryBySlug: new Map(capabilities.map((node) => [node.slug, node]))
        });
        console.log("");
        console.log(box4(renderPreExecutionSummary(summary)));
        console.log("");
      }
      const executionClient = createHostedExecutionClient();
      const session = readSession();
      if (!session || isSessionExpired(session)) {
        throw new Error("Hosted session expired. Run `growthub auth login` again.");
      }
      let hostedWorkflowId = typeof pipeline.metadata?.hostedWorkflowId === "string" ? pipeline.metadata.hostedWorkflowId : void 0;
      try {
        const saveResult = await saveHostedWorkflow(session, {
          workflowId: hostedWorkflowId,
          name: typeof pipeline.metadata?.workflowName === "string" ? pipeline.metadata.workflowName : inferWorkflowName(pipeline),
          description: typeof pipeline.metadata?.description === "string" ? pipeline.metadata.description : "",
          config: compileToHostedWorkflowConfig(pipeline)
        });
        hostedWorkflowId = saveResult?.workflowId ?? hostedWorkflowId;
      } catch (err) {
        if (!(err instanceof HostedEndpointUnavailableError)) {
          throw err;
        }
      }
      let completedNodes = 0;
      const totalNodes = Math.max(1, pipeline.nodes.length);
      const completed = /* @__PURE__ */ new Set();
      const trackableNodeIds = new Set(pipeline.nodes.map((node) => node.id));
      const result = await executionClient.executeWorkflow({
        pipelineId: pipeline.pipelineId,
        workflowId: hostedWorkflowId,
        threadId: hostedWorkflowId ?? pipeline.threadId,
        nodes: pipeline.nodes.map((n) => ({
          nodeId: n.id,
          slug: n.slug,
          bindings: n.bindings,
          upstreamNodeIds: n.upstreamNodeIds
        })),
        executionMode: pipeline.executionMode,
        metadata: pipeline.metadata
      }, opts.json ? void 0 : {
        onEvent: async (event) => {
          if (event.type === "node_complete" && event.nodeId && trackableNodeIds.has(event.nodeId) && !completed.has(event.nodeId)) {
            completed.add(event.nodeId);
            completedNodes = completed.size;
            const node = pipeline.nodes.find((candidate) => candidate.id === event.nodeId);
            renderExecutionProgress(completedNodes, totalNodes, node?.slug ?? event.nodeId);
          }
          if (event.type === "error") {
            renderExecutionProgress(totalNodes, totalNodes, "failed");
          }
        }
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log("");
      console.log(pc30.bold("Pipeline Execution Result"));
      console.log(hr4());
      console.log(`  ${pc30.dim("Execution ID:")} ${result.executionId}`);
      if (result.threadId)
        console.log(`  ${pc30.dim("Thread ID:")}    ${result.threadId}`);
      console.log(`  ${pc30.dim("Status:")}       ${result.status === "succeeded" ? pc30.green(result.status) : pc30.red(result.status)}`);
      if (result.startedAt)
        console.log(`  ${pc30.dim("Started:")}      ${result.startedAt}`);
      if (result.completedAt)
        console.log(`  ${pc30.dim("Completed:")}    ${result.completedAt}`);
      console.log(hr4());
      for (const [nodeId, nodeResult] of Object.entries(result.nodeResults)) {
        const statusColor3 = nodeResult.status === "succeeded" ? pc30.green : pc30.red;
        console.log(`  ${statusColor3(nodeResult.status)} ${pc30.bold(nodeResult.slug)} (${pc30.dim(nodeId)})`);
        if (nodeResult.error) {
          console.log(`    ${pc30.red(nodeResult.error)}`);
        }
      }
      if (result.artifacts.length > 0) {
        console.log("");
        console.log(pc30.bold("  Artifacts:"));
        for (const art of result.artifacts) {
          console.log(`    ${pc30.dim("\xB7")} ${art.artifactType} (${art.artifactId})`);
        }
      }
      if (result.summary) {
        console.log("");
        console.log(pc30.bold("  Summary:"));
        if (result.summary.outputText)
          console.log(`    ${pc30.dim("\xB7")} ${result.summary.outputText}`);
        if (typeof result.summary.imageCount === "number")
          console.log(`    ${pc30.dim("\xB7")} images: ${result.summary.imageCount}`);
        if (typeof result.summary.slideCount === "number")
          console.log(`    ${pc30.dim("\xB7")} slides: ${result.summary.slideCount}`);
        if (typeof result.summary.videoCount === "number")
          console.log(`    ${pc30.dim("\xB7")} videos: ${result.summary.videoCount}`);
        if (result.summary.workflowRunId)
          console.log(`    ${pc30.dim("\xB7")} workflow_run_id: ${result.summary.workflowRunId}`);
        if (result.summary.keyboardShortcutHint)
          console.log(`    ${pc30.dim("\xB7")} ${result.summary.keyboardShortcutHint}`);
      }
      try {
        const credits = await fetchHostedCredits(session);
        if (credits) {
          console.log("");
          console.log(pc30.bold("  Credits:"));
          console.log(`    ${pc30.dim("\xB7")} available: $${credits.totalAvailable.toFixed(2)}`);
          console.log(`    ${pc30.dim("\xB7")} used this period: $${credits.creditsUsedThisPeriod.toFixed(2)} / $${credits.creditsPerMonth.toFixed(2)}`);
        }
      } catch (err) {
        if (!(err instanceof HostedEndpointUnavailableError)) {
          throw err;
        }
      }
      const artifactStore = createArtifactStore();
      for (const artRef of result.artifacts) {
        const nodeResult = result.nodeResults[artRef.nodeId];
        artifactStore.create({
          artifactType: artRef.artifactType,
          sourceNodeSlug: nodeResult?.slug ?? "unknown",
          executionContext: pipeline.executionMode === "local" ? "local" : "hosted",
          pipelineId: pipeline.pipelineId,
          nodeId: artRef.nodeId,
          threadId: pipeline.threadId,
          metadata: artRef.metadata ?? {}
        });
      }
      console.log("");
    } catch (err) {
      console.error(pc30.red("Execution failed: " + err.message));
      process.exitCode = 1;
    }
  });
}

// src/commands/artifact.ts
import pc31 from "picocolors";
function hr5(width = 72) {
  return pc31.dim("\u2500".repeat(width));
}
var ARTIFACT_TYPE_CONFIG = {
  video: { color: pc31.magenta, emoji: "\u{1F3AC}" },
  image: { color: pc31.cyan, emoji: "\u{1F5BC}\uFE0F " },
  slides: { color: pc31.yellow, emoji: "\u{1F4CA}" },
  text: { color: pc31.green, emoji: "\u{1F4DD}" },
  report: { color: pc31.blue, emoji: "\u{1F4CB}" },
  pipeline: { color: pc31.red, emoji: "\u{1F517}" }
};
function artifactTypeBadge(type) {
  const cfg = ARTIFACT_TYPE_CONFIG[type];
  if (!cfg)
    return type;
  return cfg.color(`${cfg.emoji} ${type}`);
}
function statusColor(status) {
  if (status === "ready")
    return pc31.green(status);
  if (status === "generating" || status === "pending")
    return pc31.yellow(status);
  if (status === "failed")
    return pc31.red(status);
  if (status === "archived")
    return pc31.dim(status);
  return status;
}
function printArtifactTable(artifacts) {
  console.log("");
  console.log(
    pc31.bold("Pipeline Artifacts") + pc31.dim(`  ${artifacts.length} artifact${artifacts.length !== 1 ? "s" : ""}`)
  );
  console.log(hr5());
  if (artifacts.length === 0) {
    console.log(pc31.dim("  No artifacts found."));
    console.log(pc31.dim("  Run `growthub pipeline execute` to produce artifacts."));
    console.log("");
    return;
  }
  for (const art of artifacts) {
    const badge2 = artifactTypeBadge(art.artifactType);
    const status = statusColor(art.status);
    console.log(
      `  ${badge2}  ${pc31.bold(art.id)}  ${status}  ${pc31.dim(art.sourceNodeSlug)}  ${pc31.dim(art.executionContext)}`
    );
    if (art.pipelineId) {
      console.log(`    ${pc31.dim("Pipeline:")} ${art.pipelineId}`);
    }
    console.log(`    ${pc31.dim("Created:")} ${art.createdAt}`);
    console.log("");
  }
  console.log(hr5());
  console.log(pc31.dim("  growthub artifact inspect <id>  \xB7  growthub artifact list --type <type>"));
  console.log("");
}
function printArtifactDetail(art) {
  console.log("");
  console.log(pc31.bold("Artifact: " + art.id));
  console.log(hr5());
  const kv = (label, value) => {
    if (value === void 0)
      return;
    console.log(`  ${pc31.bold(label.padEnd(22))} ${value}`);
  };
  kv("Type:", artifactTypeBadge(art.artifactType));
  kv("Status:", statusColor(art.status));
  kv("Source Node:", art.sourceNodeSlug);
  kv("Execution Context:", art.executionContext);
  kv("Pipeline ID:", art.pipelineId);
  kv("Node ID:", art.nodeId);
  kv("Thread ID:", art.threadId);
  kv("Connection ID:", art.createdByConnectionId);
  kv("Created:", art.createdAt);
  kv("Updated:", art.updatedAt);
  if (art.metadata && Object.keys(art.metadata).length > 0) {
    console.log("");
    console.log(pc31.bold("  Metadata:"));
    console.log("  " + JSON.stringify(art.metadata, null, 2).split("\n").join("\n  "));
  }
  console.log(hr5());
  console.log("");
}
function registerArtifactCommands(program2) {
  const art = program2.command("artifact").description("List and inspect pipeline execution artifacts").addHelpText("after", `
Examples:
  $ growthub artifact list                  # all artifacts
  $ growthub artifact list --type video     # filter by type
  $ growthub artifact list --pipeline <id>  # filter by pipeline
  $ growthub artifact list --json           # machine-readable output
  $ growthub artifact inspect <id>          # inspect a specific artifact
`);
  art.action(async (opts) => {
    const store = createArtifactStore();
    const { artifacts, meta } = store.list();
    if (opts.json) {
      console.log(JSON.stringify({ artifacts, meta }, null, 2));
      return;
    }
    printArtifactTable(artifacts);
  });
  art.command("list").description("List all pipeline execution artifacts").option("--type <type>", "Filter by artifact type (video, image, slides, text, report, pipeline)").option("--pipeline <id>", "Filter by pipeline ID").option("--status <status>", "Filter by status (pending, generating, ready, failed, archived)").option("--limit <n>", "Limit results", (v) => Number(v)).option("--json", "Output raw JSON for scripting").action((opts) => {
    const store = createArtifactStore();
    const { artifacts, meta } = store.list({
      artifactType: opts.type,
      pipelineId: opts.pipeline,
      status: opts.status,
      limit: opts.limit
    });
    if (opts.json) {
      console.log(JSON.stringify({ artifacts, meta }, null, 2));
      return;
    }
    printArtifactTable(artifacts);
    console.log(pc31.dim(`  Store: ${store.getStorePath()}  \xB7  Source: ${meta.source}`));
    console.log("");
  });
  art.command("inspect").description("Inspect a specific pipeline artifact").argument("<id>", "Artifact ID (e.g. art_xxxxxxxxxxxx)").option("--json", "Output raw JSON").action((artifactId, opts) => {
    const store = createArtifactStore();
    const artifact = store.get(artifactId);
    if (!artifact) {
      console.error(pc31.red(`Artifact not found: "${artifactId}".`) + pc31.dim(" Run `growthub artifact list` to browse."));
      process.exitCode = 1;
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify(artifact, null, 2));
      return;
    }
    printArtifactDetail(artifact);
  });
}

// src/commands/workflow.ts
import fs23 from "node:fs";
import path31 from "node:path";
import * as p21 from "@clack/prompts";
import pc33 from "picocolors";

// src/runtime/workflow-hygiene/labels.ts
init_home();
import fs22 from "node:fs";
import path30 from "node:path";
function resolveStorePath() {
  return path30.resolve(resolvePaperclipHomeDir(), "workflow-hygiene", "labels.json");
}
function readStoreFile(filePath) {
  if (!fs22.existsSync(filePath))
    return { records: [] };
  try {
    const raw = JSON.parse(fs22.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(raw.records))
      return { records: [] };
    return raw;
  } catch {
    return { records: [] };
  }
}
function writeStoreFile(filePath, data) {
  fs22.mkdirSync(path30.dirname(filePath), { recursive: true });
  fs22.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}
`, "utf-8");
}
function inferDefaultLabel(name, createdAt, versionCount) {
  if (versionCount >= 3)
    return "canonical";
  if (name.toLowerCase().includes("experiment"))
    return "experimental";
  if (createdAt && Date.now() - Date.parse(createdAt) > 1e3 * 60 * 60 * 24 * 90) {
    return "archived";
  }
  return "experimental";
}
function createWorkflowHygieneStore() {
  const filePath = resolveStorePath();
  return {
    getLabel(workflowId) {
      const store = readStoreFile(filePath);
      const record = store.records.find((entry) => entry.workflowId === workflowId);
      return record?.label ?? null;
    },
    setLabel(workflowId, label) {
      const store = readStoreFile(filePath);
      const idx = store.records.findIndex((entry) => entry.workflowId === workflowId);
      const nextRecord = {
        workflowId,
        label,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (idx >= 0) {
        store.records[idx] = nextRecord;
      } else {
        store.records.push(nextRecord);
      }
      writeStoreFile(filePath, store);
    },
    list() {
      const store = readStoreFile(filePath);
      return [...store.records];
    }
  };
}

// src/runtime/workflow-hygiene/summaries.ts
import pc32 from "picocolors";
function renderWorkflowLabel(label) {
  if (label === "canonical")
    return pc32.green("canonical");
  if (label === "archived")
    return pc32.dim("archived");
  return pc32.yellow("experimental");
}
function enrichWorkflowSummaries(entries, store) {
  return entries.map((entry) => {
    const workflowLabel = store.getLabel(entry.workflowId) ?? inferDefaultLabel(entry.name, entry.createdAt, entry.versionCount ?? 0);
    return { ...entry, workflowLabel };
  });
}

// src/commands/workflow.ts
init_banner();
init_home();
var PAGE_SIZE = 10;
var FAMILY_CONFIG2 = {
  video: { color: pc33.magenta, label: "Video" },
  image: { color: pc33.cyan, label: "Image" },
  slides: { color: pc33.yellow, label: "Slides" },
  text: { color: pc33.green, label: "Text" },
  data: { color: pc33.blue, label: "Data" },
  ops: { color: pc33.red, label: "Ops" },
  research: { color: pc33.blue, label: "Research" },
  vision: { color: pc33.cyan, label: "Vision" }
};
var FAMILY_EMOJI = {
  video: "\u{1F3AC}",
  image: "\u{1F5BC}\uFE0F",
  slides: "\u{1F9E9}",
  text: "\u{1F4DD}",
  data: "\u{1F4CA}",
  ops: "\u{1F6E0}\uFE0F",
  research: "\u{1F50E}",
  vision: "\u{1F441}\uFE0F"
};
function familyLabel(family) {
  const cfg = FAMILY_CONFIG2[family];
  return cfg ? cfg.color(cfg.label) : family;
}
function hr6(width = 72) {
  return pc33.dim("\u2500".repeat(width));
}
function stripAnsi5(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}
function box5(lines) {
  const padded = lines.map((l) => "  " + l);
  const width = Math.max(...padded.map((l) => stripAnsi5(l).length)) + 4;
  const top = pc33.dim("\u250C" + "\u2500".repeat(width) + "\u2510");
  const bottom = pc33.dim("\u2514" + "\u2500".repeat(width) + "\u2518");
  const body = padded.map((l) => {
    const pad = width - stripAnsi5(l).length;
    return pc33.dim("\u2502") + l + " ".repeat(pad) + pc33.dim("\u2502");
  });
  return [top, ...body, bottom].join("\n");
}
function resolveSavedWorkflowsDir() {
  return path31.resolve(resolvePaperclipHomeDir(), "workflows");
}
function resolveDeletedWorkflowIdsPath() {
  return path31.resolve(resolvePaperclipHomeDir(), "workflow-hygiene", "deleted-workflows.json");
}
function readDeletedWorkflowIds() {
  const filePath = resolveDeletedWorkflowIdsPath();
  if (!fs23.existsSync(filePath))
    return /* @__PURE__ */ new Set();
  try {
    const raw = JSON.parse(fs23.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(raw?.workflowIds))
      return /* @__PURE__ */ new Set();
    return new Set(raw.workflowIds.filter((value) => typeof value === "string"));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function writeDeletedWorkflowIds(ids) {
  const filePath = resolveDeletedWorkflowIdsPath();
  fs23.mkdirSync(path31.dirname(filePath), { recursive: true });
  fs23.writeFileSync(filePath, `${JSON.stringify({ workflowIds: [...ids] }, null, 2)}
`, "utf-8");
}
function markWorkflowDeletedLocally(workflowId) {
  const ids = readDeletedWorkflowIds();
  ids.add(workflowId);
  writeDeletedWorkflowIds(ids);
}
function effectiveWorkflowLabel(entry, hygieneStore) {
  const explicitLabel = hygieneStore.getLabel(entry.workflowId);
  if (explicitLabel)
    return explicitLabel;
  if (entry.isActive === false)
    return "archived";
  return entry.workflowLabel ?? "experimental";
}
function withEffectiveWorkflowLabels(entries, hygieneStore) {
  return entries.map((entry) => ({
    ...entry,
    workflowLabel: effectiveWorkflowLabel(entry, hygieneStore)
  }));
}
function filterLocallyDeletedWorkflows(entries) {
  const deletedIds = readDeletedWorkflowIds();
  return entries.filter((entry) => !deletedIds.has(entry.workflowId));
}
function listLocalSavedWorkflows() {
  const dir = resolveSavedWorkflowsDir();
  if (!fs23.existsSync(dir))
    return [];
  const entries = fs23.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => {
    try {
      const raw = JSON.parse(fs23.readFileSync(path31.resolve(dir, e.name), "utf-8"));
      const pipeline = raw.pipeline ?? raw;
      return {
        filename: e.name,
        workflowId: pipeline.metadata?.hostedWorkflowId ?? pipeline.pipelineId ?? e.name.replace(".json", ""),
        pipelineId: pipeline.pipelineId ?? e.name.replace(".json", ""),
        name: pipeline.metadata?.workflowName ?? pipeline.pipelineId ?? e.name.replace(".json", ""),
        nodeCount: Array.isArray(pipeline.nodes) ? pipeline.nodes.length : 0,
        executionMode: pipeline.executionMode ?? "hosted",
        createdAt: raw.createdAt ?? "",
        source: "local"
      };
    } catch {
      return null;
    }
  });
  return entries.filter((entry) => entry !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function listSavedWorkflows() {
  const session = readSession();
  if (!session || isSessionExpired(session)) {
    return listLocalSavedWorkflows();
  }
  try {
    const response = await listHostedWorkflows(session);
    if (!response || !Array.isArray(response.workflows))
      return listLocalSavedWorkflows();
    return response.workflows.map((workflow) => ({
      workflowId: workflow.workflowId,
      pipelineId: workflow.workflowId,
      name: workflow.name,
      nodeCount: workflow.latestVersion?.nodeCount ?? 0,
      executionMode: "hosted",
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      versionCount: workflow.versionCount,
      source: "hosted",
      isActive: workflow.isActive
    }));
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      return listLocalSavedWorkflows();
    }
    throw err;
  }
}
async function archiveSavedWorkflow(entry) {
  if (entry.source === "hosted") {
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      throw new Error("Hosted session expired while archiving workflow.");
    }
    const result = await archiveHostedWorkflow(session, { workflowId: entry.workflowId });
    if (!result?.ok) {
      throw new Error(`Failed to archive hosted workflow ${entry.workflowId}.`);
    }
    return;
  }
  if (!entry.filename) {
    throw new Error("Local workflow entry is missing filename.");
  }
  const dir = resolveSavedWorkflowsDir();
  const archiveDir = path31.resolve(dir, "archived");
  fs23.mkdirSync(archiveDir, { recursive: true });
  fs23.renameSync(
    path31.resolve(dir, entry.filename),
    path31.resolve(archiveDir, entry.filename)
  );
}
async function deleteSavedWorkflow(entry) {
  if (entry.source === "hosted") {
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      throw new Error("Hosted session expired while deleting workflow.");
    }
    try {
      const result = await deleteHostedWorkflow(session, { workflowId: entry.workflowId });
      if (!result?.ok) {
        throw new Error(`Failed to delete hosted workflow ${entry.workflowId}.`);
      }
      markWorkflowDeletedLocally(entry.workflowId);
      return;
    } catch {
      markWorkflowDeletedLocally(entry.workflowId);
      return;
    }
  }
  if (!entry.filename) {
    throw new Error("Local workflow entry is missing filename.");
  }
  fs23.rmSync(path31.resolve(resolveSavedWorkflowsDir(), entry.filename), { force: true });
  markWorkflowDeletedLocally(entry.workflowId);
}
async function loadSavedWorkflowDetail(entry) {
  if (entry.source === "hosted") {
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      throw new Error("Hosted session expired while loading workflow detail.");
    }
    const detail = await fetchHostedWorkflow(session, entry.workflowId);
    if (!detail) {
      throw new Error(`Hosted workflow ${entry.workflowId} not found.`);
    }
    return {
      pipeline: detail.latestVersion.config ?? {},
      createdAt: detail.latestVersion.createdAt
    };
  }
  const dir = resolveSavedWorkflowsDir();
  const content = fs23.readFileSync(path31.resolve(dir, entry.filename), "utf-8");
  const raw = JSON.parse(content);
  return {
    pipeline: raw.pipeline ?? raw,
    createdAt: raw.createdAt ?? ""
  };
}
function toDynamicPipelineFromHostedWorkflow(entry, pipeline) {
  const rawNodes = Array.isArray(pipeline.nodes) ? pipeline.nodes : [];
  const rawEdges = Array.isArray(pipeline.edges) ? pipeline.edges : [];
  const cmsNodes = rawNodes.filter((node) => {
    return typeof node === "object" && node !== null && node.type === "cmsNode";
  });
  const upstreamNodeIdsByTarget = /* @__PURE__ */ new Map();
  for (const edge of rawEdges) {
    if (typeof edge !== "object" || edge === null)
      continue;
    const source = typeof edge.source === "string" ? edge.source : null;
    const target = typeof edge.target === "string" ? edge.target : null;
    if (!source || !target || source === "start-1" || target === "end-1")
      continue;
    const existing = upstreamNodeIdsByTarget.get(target) ?? [];
    existing.push(source);
    upstreamNodeIdsByTarget.set(target, existing);
  }
  return {
    pipelineId: entry.pipelineId,
    executionMode: "hosted",
    nodes: cmsNodes.map((node) => {
      const id = typeof node.id === "string" ? node.id : `node-${Math.random().toString(36).slice(2, 8)}`;
      const data = typeof node.data === "object" && node.data !== null ? node.data : {};
      return {
        id,
        slug: typeof data.slug === "string" ? data.slug : id,
        bindings: typeof data.inputs === "object" && data.inputs !== null ? data.inputs : {},
        upstreamNodeIds: upstreamNodeIdsByTarget.get(id)
      };
    }),
    metadata: {
      hostedWorkflowId: entry.workflowId,
      workflowName: entry.name
    }
  };
}
function toExecutableSavedWorkflowPipeline(entry, pipeline) {
  const looksLikeDynamicPipeline = Array.isArray(pipeline.nodes) && pipeline.nodes.every((node) => {
    if (typeof node !== "object" || node === null)
      return false;
    const record = node;
    return typeof record.id === "string" && typeof record.slug === "string";
  });
  if (looksLikeDynamicPipeline) {
    const parsed = deserializePipeline(pipeline);
    return {
      ...parsed,
      metadata: {
        ...parsed.metadata ?? {},
        hostedWorkflowId: entry.workflowId,
        workflowName: entry.name
      }
    };
  }
  return toDynamicPipelineFromHostedWorkflow(entry, pipeline);
}
async function paginatedSelect(message, allOptions, opts) {
  let offset = 0;
  let filtered = allOptions;
  while (true) {
    const page = filtered.slice(offset, offset + PAGE_SIZE);
    const hasMore = offset + PAGE_SIZE < filtered.length;
    const hasPrev = offset > 0;
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
    const pageInfo = filtered.length > PAGE_SIZE ? pc33.dim(` (${currentPage}/${totalPages} \xB7 ${filtered.length} total)`) : "";
    const options = [
      ...page.map((o) => ({
        value: o.value,
        label: o.label,
        hint: o.hint
      }))
    ];
    if (hasMore) {
      options.push({ value: "__next_page", label: pc33.dim("\u2192 Next page") });
    }
    if (hasPrev) {
      options.push({ value: "__prev_page", label: pc33.dim("\u2190 Previous page") });
    }
    if (opts?.searchEnabled) {
      options.push({ value: "__search", label: pc33.dim("\u{1F50E} Search") });
    }
    options.push({
      value: opts?.backValue ?? "__back",
      label: opts?.backLabel ?? "\u2190 Back"
    });
    const choice = await p21.select({
      message: message + pageInfo,
      options
    });
    if (p21.isCancel(choice))
      return choice;
    if (choice === "__next_page") {
      offset += PAGE_SIZE;
      continue;
    }
    if (choice === "__prev_page") {
      offset = Math.max(0, offset - PAGE_SIZE);
      continue;
    }
    if (choice === "__search") {
      const term = await p21.text({
        message: "Search items",
        placeholder: "Type to filter..."
      });
      if (p21.isCancel(term))
        return term;
      const searchStr = term.toLowerCase().trim();
      if (searchStr) {
        filtered = allOptions.filter((o) => {
          const haystack = `${o.value} ${o.label} ${o.hint ?? ""}`.toLowerCase();
          return haystack.includes(searchStr);
        });
        offset = 0;
        if (filtered.length === 0) {
          p21.note(`No results for "${term}".`, "No matches");
          filtered = allOptions;
        }
      } else {
        filtered = allOptions;
        offset = 0;
      }
      continue;
    }
    return choice;
  }
}
function printTemplateCard(node) {
  const contract = introspectNodeContract(node);
  const lines = renderContractCard(contract);
  lines.splice(1, 0, `${familyLabel(node.family)}  ${node.enabled ? pc33.green("enabled") : pc33.red("disabled")}`);
  if (node.description)
    lines.push("", pc33.dim(node.description));
  console.log("");
  console.log(box5(lines));
  console.log("");
}
function renderTemplateTree(templates) {
  const byFamily = /* @__PURE__ */ new Map();
  for (const template of templates) {
    const key = template.family;
    const existing = byFamily.get(key) ?? [];
    existing.push(template);
    byFamily.set(key, existing);
  }
  const families = [...byFamily.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const lines = [pc33.bold("Public CMS Node Tree")];
  for (const [family, nodes] of families) {
    lines.push(`${pc33.cyan("\u2022")} ${pc33.bold(family)}`);
    const sorted = [...nodes].sort((a, b) => a.slug.localeCompare(b.slug));
    for (const [index51, node] of sorted.entries()) {
      const branch = index51 === sorted.length - 1 ? "\u2514\u2500" : "\u251C\u2500";
      const contract = introspectNodeContract(node);
      const requiredInputs = contract.inputs.filter((input) => input.required).length;
      const optionalInputs = contract.inputs.length - requiredInputs;
      lines.push(
        `  ${branch} ${node.slug} ${pc33.dim(`(req:${requiredInputs} opt:${optionalInputs} out:${contract.outputTypes.length})`)}`
      );
    }
  }
  lines.push("");
  lines.push(pc33.dim("Shortcut: growthub workflow saved --json"));
  return lines;
}
function renderWorkflowContractDiscoveryTree(nodes) {
  const byFamily = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    const key = node.family;
    const group = byFamily.get(key) ?? [];
    group.push(node);
    byFamily.set(key, group);
  }
  const families = [...byFamily.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const lines = [pc33.bold("CMS Node Contract Discovery")];
  for (const [family, familyNodes] of families) {
    const emoji = FAMILY_EMOJI[family] ?? "\u2022";
    lines.push(`${emoji} ${pc33.bold(familyLabel(family))} ${pc33.dim(`(${familyNodes.length})`)}`);
    const sorted = [...familyNodes].sort((a, b) => a.slug.localeCompare(b.slug));
    for (const [index51, node] of sorted.entries()) {
      const branch = index51 === sorted.length - 1 ? "\u2514\u2500" : "\u251C\u2500";
      const contract = introspectNodeContract(node);
      const requiredInputs = contract.inputs.filter((input) => input.required).length;
      const optionalInputs = contract.inputs.length - requiredInputs;
      lines.push(
        `  ${branch} ${node.slug} ${pc33.dim(`req:${requiredInputs} opt:${optionalInputs} bindings:${contract.requiredBindings.length} outputs:${contract.outputTypes.length}`)}`
      );
    }
  }
  return lines;
}
function buildTemplateOption(template, viewMode) {
  const contract = introspectNodeContract(template);
  const requiredInputs = contract.inputs.filter((input) => input.required).length;
  const optionalInputs = contract.inputs.length - requiredInputs;
  if (viewMode === "expanded") {
    return {
      value: template.slug,
      label: `${template.icon}  ${template.displayName} ${pc33.dim(template.slug)}`,
      hint: `req:${requiredInputs} opt:${optionalInputs} outputs:${contract.outputTypes.join(", ") || "none"} exec:${contract.executionStrategy}`
    };
  }
  if (viewMode === "tree") {
    return {
      value: template.slug,
      label: `${template.family} / ${template.slug}`,
      hint: `req:${requiredInputs} opt:${optionalInputs}`
    };
  }
  return {
    value: template.slug,
    label: `${template.icon}  ${template.displayName}`,
    hint: template.description?.slice(0, 55)
  };
}
async function runWorkflowPicker(opts) {
  printPaperclipCliBanner();
  const hygieneStore = createWorkflowHygieneStore();
  const access = getWorkflowAccess();
  if (access.state === "unauthenticated") {
    p21.intro(pc33.bold("Workflows") + pc33.dim(" (not connected)"));
    p21.note(
      [
        "Workflow assembly requires an authenticated Growthub session.",
        "Run " + pc33.cyan("growthub auth login") + " to connect your account.",
        "",
        "Once connected you can:",
        "  - Browse CMS node contracts",
        "  - Assemble dynamic hosted pipelines",
        "  - Save and execute workflows"
      ].join("\n"),
      "Authentication Required"
    );
    if (opts.allowBackToHub)
      return "back";
    return "done";
  }
  p21.intro(pc33.bold("Workflows"));
  while (true) {
    const refreshedAccess = getWorkflowAccess();
    const topChoice = await p21.select({
      message: "What would you like to do?",
      options: [
        {
          value: "contracts",
          label: refreshedAccess.state === "ready" ? "0. CMS Node Contracts" : pc33.dim("0. CMS Node Contracts (locked)"),
          hint: refreshedAccess.state === "ready" ? "Discovery tree for CMS node primitives" : refreshedAccess.reason
        },
        {
          value: "pipelines",
          label: refreshedAccess.state === "ready" ? "1. Dynamic Pipelines" : pc33.dim("1. Dynamic Pipelines (locked)"),
          hint: refreshedAccess.state === "ready" ? "Create new pipelines and route into Saved Workflows" : refreshedAccess.reason
        },
        {
          value: "saved",
          label: "2. Saved Workflows",
          hint: "Execute, label, archive, delete"
        },
        ...opts.allowBackToHub ? [{ value: "__back_to_hub", label: "\u2190 Back to main menu" }] : []
      ]
    });
    if (p21.isCancel(topChoice)) {
      p21.cancel("Cancelled.");
      process.exit(0);
    }
    if (topChoice === "__back_to_hub")
      return "back";
    if (topChoice === "contracts" && refreshedAccess.state !== "ready") {
      p21.note(
        [
          "CMS Node Contracts are only available when the hosted user is linked to this local machine.",
          refreshedAccess.reason
        ].join("\n"),
        "Growthub Local Machine Required"
      );
      continue;
    }
    if (topChoice === "contracts") {
      const contractsSpinner = p21.spinner();
      contractsSpinner.start("Loading CMS node contracts...");
      try {
        const registry = createCmsCapabilityRegistryClient();
        const { nodes } = await registry.listCapabilities({ enabledOnly: false });
        contractsSpinner.stop(`Loaded ${nodes.length} CMS node contract${nodes.length === 1 ? "" : "s"}.`);
        if (nodes.length === 0) {
          p21.note("No CMS node contracts available.", "Nothing found");
          continue;
        }
        let showDiscoveryTree = false;
        while (true) {
          if (showDiscoveryTree) {
            console.log("");
            console.log(box5(renderWorkflowContractDiscoveryTree(nodes)));
            console.log("");
            showDiscoveryTree = false;
          }
          const contractsMenuChoice = await p21.select({
            message: "CMS Node Contracts",
            options: [
              { value: "browse", label: "Browse contract list", hint: "Select a node and view full contract" },
              { value: "show_tree", label: "Show discovery tree", hint: "Family primitives and contract counts" },
              { value: "__back_to_workflow", label: "\u2190 Back to workflow menu" }
            ]
          });
          if (p21.isCancel(contractsMenuChoice)) {
            p21.cancel("Cancelled.");
            process.exit(0);
          }
          if (contractsMenuChoice === "__back_to_workflow")
            break;
          if (contractsMenuChoice === "show_tree") {
            showDiscoveryTree = true;
            continue;
          }
          const contractOptions = [...nodes].sort((a, b) => a.slug.localeCompare(b.slug)).map((node) => {
            const contract = introspectNodeContract(node);
            const requiredInputs = contract.inputs.filter((input) => input.required).length;
            return {
              value: node.slug,
              label: `${node.icon}  ${node.displayName} ${pc33.dim(node.slug)}`,
              hint: `${node.family} \xB7 required:${requiredInputs} \xB7 bindings:${contract.requiredBindings.length} \xB7 outputs:${contract.outputTypes.length}`
            };
          });
          const contractChoice = await paginatedSelect(
            "Select CMS node contract",
            contractOptions,
            {
              backLabel: "\u2190 Back to CMS contracts menu",
              searchEnabled: true
            }
          );
          if (p21.isCancel(contractChoice)) {
            p21.cancel("Cancelled.");
            process.exit(0);
          }
          if (contractChoice === "__back")
            continue;
          const selected = nodes.find((node) => node.slug === contractChoice);
          if (!selected)
            continue;
          printTemplateCard(selected);
          const contractAction = await p21.select({
            message: "Contract actions",
            options: [
              { value: "inspect_json", label: "Inspect raw input template JSON" },
              { value: "back_to_contracts_menu", label: "\u2190 Back to CMS contracts menu" },
              { value: "back_to_workflow_menu", label: "\u2190 Back to workflow menu" }
            ]
          });
          if (p21.isCancel(contractAction)) {
            p21.cancel("Cancelled.");
            process.exit(0);
          }
          if (contractAction === "inspect_json") {
            console.log(JSON.stringify(selected.executionTokens.input_template, null, 2));
            continue;
          }
          if (contractAction === "back_to_workflow_menu") {
            break;
          }
        }
      } catch (err) {
        contractsSpinner.stop(pc33.red("Failed to load CMS node contracts."));
        p21.log.error("Failed to load CMS node contracts: " + err.message);
      }
      continue;
    }
    if (topChoice === "pipelines") {
      if (refreshedAccess.state !== "ready") {
        p21.note(
          [
            "Dynamic Pipelines are only available when the hosted user is linked to this local machine.",
            refreshedAccess.reason
          ].join("\n"),
          "Growthub Local Machine Required"
        );
        continue;
      }
      const result = await runPipelineAssembler({ allowBackToHub: true });
      if (result === "back") {
        continue;
      }
      return "done";
    }
    if (topChoice === "saved") {
      while (true) {
        const savedSpinner = p21.spinner();
        savedSpinner.start("Loading saved workflows...");
        let saved;
        try {
          const enriched = enrichWorkflowSummaries(
            filterLocallyDeletedWorkflows(await listSavedWorkflows()),
            hygieneStore
          );
          saved = withEffectiveWorkflowLabels(enriched, hygieneStore);
          savedSpinner.stop(`Loaded ${saved.length} saved workflow${saved.length === 1 ? "" : "s"}.`);
        } catch (err) {
          savedSpinner.stop(pc33.red("Failed to load saved workflows."));
          throw err;
        }
        if (saved.length === 0) {
          p21.note(
            [
              "No saved workflows found.",
              "Use " + pc33.cyan("growthub pipeline assemble") + " to create a new workflow pipeline."
            ].join("\n"),
            "Nothing saved"
          );
          break;
        }
        const allOptions = saved.map((w) => ({
          value: w.workflowId,
          label: `${w.name} ${pc33.dim(`[${renderWorkflowLabel(w.workflowLabel)}]`)}  ${pc33.dim(`${w.nodeCount} node${w.nodeCount !== 1 ? "s" : ""}`)}`,
          hint: `${w.executionMode} \xB7 ${w.updatedAt?.slice(0, 10) ?? w.createdAt.slice(0, 10)}`
        }));
        const choice = await paginatedSelect("Select a saved workflow", allOptions, {
          backLabel: "\u2190 Back to workflow menu",
          searchEnabled: true
        });
        if (p21.isCancel(choice)) {
          p21.cancel("Cancelled.");
          process.exit(0);
        }
        if (choice === "__back")
          break;
        const entry = saved.find((w) => w.workflowId === choice);
        if (entry) {
          const detailSpinner = p21.spinner();
          detailSpinner.start(`Loading ${entry.name}...`);
          let detail;
          try {
            detail = await loadSavedWorkflowDetail(entry);
            detailSpinner.stop(`Loaded ${entry.name}.`);
          } catch (err) {
            detailSpinner.stop(pc33.red(`Failed to load ${entry.name}.`));
            p21.log.error(err.message);
            continue;
          }
          const pipeline = detail.pipeline;
          const nodes = Array.isArray(pipeline.nodes) ? pipeline.nodes : [];
          console.log("");
          console.log(box5([
            `${pc33.bold("Workflow:")} ${entry.name}`,
            `${pc33.dim("ID:")} ${entry.workflowId}`,
            `${pc33.dim("Mode:")} hosted  ${pc33.dim("Nodes:")} ${nodes.length}`,
            `${pc33.dim("Label:")} ${renderWorkflowLabel(entry.workflowLabel ?? "experimental")}`,
            `${pc33.dim("Created:")} ${detail.createdAt || "\u2014"}`,
            "",
            ...nodes.map(
              (n, i) => `${pc33.dim(String(i + 1) + ".")} ${pc33.bold(n.data?.slug ?? n.slug ?? n.id)} ${pc33.dim(n.id)}`
            )
          ]));
          console.log("");
          const nextAction = await p21.select({
            message: "Action",
            options: [
              { value: "execute", label: "Execute saved workflow" },
              { value: "set_label", label: "Set workflow label" },
              { value: "archive", label: "Archive workflow" },
              { value: "unarchive", label: "Unarchive workflow" },
              { value: "delete", label: pc33.red("Delete workflow") },
              { value: "back_to_saved", label: "\u2190 Back to saved workflows" }
            ]
          });
          if (p21.isCancel(nextAction)) {
            p21.cancel("Cancelled.");
            process.exit(0);
          }
          if (nextAction === "execute") {
            const confirmed = await p21.confirm({
              message: `Execute ${entry.name} now?`,
              initialValue: false
            });
            if (p21.isCancel(confirmed) || !confirmed) {
              continue;
            }
            const finalConfirmed = await p21.confirm({
              message: "This will run the hosted workflow and may spend credits. Continue?",
              initialValue: false
            });
            if (p21.isCancel(finalConfirmed) || !finalConfirmed) {
              continue;
            }
            try {
              const executablePipeline = toExecutableSavedWorkflowPipeline(entry, pipeline);
              const registry = createCmsCapabilityRegistryClient();
              const { nodes: capabilities } = await registry.listCapabilities({ enabledOnly: false });
              const capabilityMap = new Map(capabilities.map((n) => [n.slug, n]));
              const preSummary = buildPreExecutionSummary({
                pipeline: executablePipeline,
                registryBySlug: capabilityMap
              });
              console.log("");
              console.log(box5(renderPreExecutionSummary(preSummary)));
              console.log("");
              const intelligenceSummary = await renderWorkflowIntelligenceSummary(
                executablePipeline,
                capabilities,
                "pre-execution"
              );
              if (intelligenceSummary) {
                console.log(box5(intelligenceSummary));
                console.log("");
              }
              await executeHostedPipeline(executablePipeline);
              p21.log.success(`Saved workflow execution completed for ${pc33.bold(entry.name)}.`);
            } catch (err) {
              p21.log.error("Saved workflow execution failed: " + err.message);
            }
          }
          if (nextAction === "set_label") {
            const labelChoice = await p21.select({
              message: `Set label for ${entry.name}`,
              options: [
                { value: "canonical", label: "Canonical" },
                { value: "experimental", label: "Experimental" },
                { value: "archived", label: "Archived" },
                { value: "__back", label: "\u2190 Back" }
              ]
            });
            if (p21.isCancel(labelChoice) || labelChoice === "__back") {
              continue;
            }
            hygieneStore.setLabel(entry.workflowId, labelChoice);
            p21.log.success(`Updated label for ${pc33.bold(entry.name)} to ${renderWorkflowLabel(labelChoice)}.`);
            continue;
          }
          if (nextAction === "archive") {
            const confirmed = await p21.confirm({
              message: `Archive ${entry.name}?`,
              initialValue: false
            });
            if (p21.isCancel(confirmed) || !confirmed) {
              continue;
            }
            try {
              await archiveSavedWorkflow(entry);
              hygieneStore.setLabel(entry.workflowId, "archived");
              p21.log.success(`Archived ${pc33.bold(entry.name)}.`);
            } catch {
              hygieneStore.setLabel(entry.workflowId, "archived");
              p21.log.success(`Archived ${pc33.bold(entry.name)} (local fallback).`);
            }
            continue;
          }
          if (nextAction === "unarchive") {
            if ((entry.workflowLabel ?? "experimental") !== "archived") {
              p21.note("Workflow is already live.", "Unarchive skipped");
              continue;
            }
            const restoreChoice = await p21.select({
              message: `Set label after unarchive for ${entry.name}`,
              options: [
                { value: "experimental", label: "Experimental" },
                { value: "canonical", label: "Canonical" },
                { value: "__back", label: "\u2190 Back" }
              ]
            });
            if (p21.isCancel(restoreChoice) || restoreChoice === "__back") {
              continue;
            }
            hygieneStore.setLabel(entry.workflowId, restoreChoice);
            p21.log.success(
              `Unarchived ${pc33.bold(entry.name)} to ${renderWorkflowLabel(restoreChoice)}.`
            );
            continue;
          }
          if (nextAction === "delete") {
            const confirmed = await p21.confirm({
              message: `Delete ${entry.name}? This cannot be undone.`,
              initialValue: false
            });
            if (p21.isCancel(confirmed) || !confirmed) {
              continue;
            }
            const finalConfirmed = await p21.confirm({
              message: "Final confirmation: permanently delete this workflow?",
              initialValue: false
            });
            if (p21.isCancel(finalConfirmed) || !finalConfirmed) {
              continue;
            }
            try {
              await deleteSavedWorkflow(entry);
              p21.log.success(`Deleted ${pc33.bold(entry.name)}.`);
            } catch {
              markWorkflowDeletedLocally(entry.workflowId);
              p21.log.success(`Deleted ${pc33.bold(entry.name)} (local fallback).`);
            }
            continue;
          }
        }
      }
      continue;
    }
    if (topChoice === "templates") {
      const registry = createCmsCapabilityRegistryClient();
      let hostedTemplates = [];
      let templateViewMode = "condensed";
      try {
        const hosted = await registry.listCapabilities({ enabledOnly: false });
        hostedTemplates = hosted.nodes;
      } catch (err) {
        p21.log.error("Hosted capability registry unavailable: " + err.message);
        continue;
      }
      while (true) {
        const availableFamilies = CAPABILITY_FAMILIES.filter((f) => {
          const nodes = hostedTemplates.filter((node) => node.family === f);
          return nodes.length > 0;
        });
        const familyChoice = await p21.select({
          message: "Filter by family",
          options: [
            { value: "all", label: "All Templates" },
            { value: "__tree_view", label: "Tree View (all public nodes)" },
            { value: "__toggle_view_mode", label: `View Mode: ${templateViewMode}` },
            ...availableFamilies.map((f) => {
              const cfg = FAMILY_CONFIG2[f];
              return {
                value: f,
                label: cfg ? cfg.label : f
              };
            }),
            { value: "__back_to_workflow_menu", label: "\u2190 Back to workflow menu" }
          ]
        });
        if (p21.isCancel(familyChoice)) {
          p21.cancel("Cancelled.");
          process.exit(0);
        }
        if (familyChoice === "__back_to_workflow_menu")
          break;
        if (familyChoice === "__toggle_view_mode") {
          const viewChoice = await p21.select({
            message: "Select template view mode",
            options: [
              { value: "condensed", label: "Condensed", hint: "Fast scan" },
              { value: "expanded", label: "Expanded", hint: "Contract hints in list" },
              { value: "tree", label: "Tree", hint: "Family/tree style list" }
            ]
          });
          if (p21.isCancel(viewChoice)) {
            p21.cancel("Cancelled.");
            process.exit(0);
          }
          templateViewMode = viewChoice;
          continue;
        }
        if (familyChoice === "__tree_view") {
          console.log("");
          console.log(box5(renderTemplateTree(hostedTemplates)));
          console.log("");
          continue;
        }
        const query = familyChoice === "all" ? void 0 : { family: familyChoice };
        let templates;
        try {
          templates = query ? hostedTemplates.filter((node) => node.family === query.family) : hostedTemplates;
        } catch (err) {
          p21.log.error("Failed to load templates: " + err.message);
          continue;
        }
        if (templates.length === 0) {
          p21.note("No templates for that family.", "Nothing found");
          continue;
        }
        while (true) {
          const templateOptions = templates.map((t) => buildTemplateOption(t, templateViewMode));
          const templateChoice = await paginatedSelect(
            "Select a template",
            templateOptions,
            {
              backLabel: "\u2190 Back to family filter",
              searchEnabled: true
            }
          );
          if (p21.isCancel(templateChoice)) {
            p21.cancel("Cancelled.");
            process.exit(0);
          }
          if (templateChoice === "__back")
            break;
          const selected = templates.find((t) => t.slug === templateChoice);
          if (!selected)
            continue;
          printTemplateCard(selected);
          while (true) {
            const action = await p21.select({
              message: "What would you like to do with this template?",
              options: [
                { value: "assemble", label: "Assemble a pipeline from this template" },
                { value: "resolve", label: "Check machine binding" },
                { value: "inspect_json", label: "Print input template as JSON" },
                { value: "back_to_templates", label: "\u2190 Back to template list" }
              ]
            });
            if (p21.isCancel(action)) {
              p21.cancel("Cancelled.");
              process.exit(0);
            }
            if (action === "back_to_templates")
              break;
            if (action === "resolve") {
              try {
                const resolver = createMachineCapabilityResolver();
                const binding = await resolver.resolveCapability(selected.slug);
                if (binding) {
                  const statusColor3 = binding.allowed ? pc33.green : pc33.red;
                  console.log("");
                  console.log(box5([
                    `${pc33.bold("Machine Binding:")} ${selected.slug}`,
                    `${pc33.dim("Allowed:")}  ${statusColor3(String(binding.allowed))}`,
                    `${pc33.dim("Reason:")}   ${binding.reason ?? "\u2014"}`
                  ]));
                  console.log("");
                }
              } catch (err) {
                p21.log.error("Resolution failed: " + err.message);
              }
              continue;
            }
            if (action === "inspect_json") {
              console.log(JSON.stringify(selected.executionTokens.input_template, null, 2));
              continue;
            }
            if (action === "assemble") {
              const builder = createPipelineBuilder({ executionMode: "hosted" });
              const contract = introspectNodeContract(selected);
              const rawBindings = {};
              for (const input of contract.inputs) {
                if (!input.required)
                  continue;
                const value = await p21.text({
                  message: `${selected.displayName} \u2192 ${input.key}`,
                  placeholder: `Enter ${input.key}`
                });
                if (p21.isCancel(value)) {
                  p21.cancel("Cancelled.");
                  process.exit(0);
                }
                rawBindings[input.key] = value;
              }
              const normalized = normalizeNodeBindings(rawBindings, selected);
              p21.note(
                `Provided ${normalized.providedCount}, defaulted ${normalized.defaultedCount}, normalized ${normalized.normalizedCount}.`,
                "Input normalization"
              );
              const nodeId = builder.addNode(selected.slug, normalized.bindings);
              p21.log.success(`Added ${pc33.bold(selected.displayName)} (${pc33.dim(nodeId)})`);
              const next = await p21.select({
                message: "Pipeline has 1 node. What next?",
                options: [
                  { value: "save", label: "Save pipeline" },
                  { value: "back_to_templates", label: "\u2190 Back to templates" }
                ]
              });
              if (p21.isCancel(next)) {
                p21.cancel("Cancelled.");
                process.exit(0);
              }
              if (next === "save") {
                const pipeline = builder.build();
                const session = readSession();
                if (!session || isSessionExpired(session)) {
                  throw new Error("Hosted session expired. Run `growthub auth login` again.");
                }
                const workflowName = `${selected.displayName} Workflow`;
                const pipelineSummary = buildPreExecutionSummary({
                  pipeline,
                  registryBySlug: /* @__PURE__ */ new Map([[selected.slug, selected]])
                });
                console.log("");
                console.log(box5(renderPreSaveReview({
                  workflowName,
                  summary: pipelineSummary
                })));
                console.log("");
                const saveResult = await saveHostedWorkflow(session, {
                  name: workflowName,
                  description: selected.description ?? "",
                  config: compileToHostedWorkflowConfig(pipeline, { workflowName })
                });
                if (!saveResult || typeof saveResult.workflowId !== "string") {
                  throw new Error("Hosted workflow save returned no payload.");
                }
                p21.log.success(
                  `Hosted workflow saved as ${pc33.bold(workflowName)} (${pc33.dim(saveResult.workflowId)} \xB7 v${saveResult.version})`
                );
              }
              break;
            }
          }
        }
      }
      continue;
    }
  }
}
async function renderWorkflowIntelligenceSummary(pipeline, capabilities, phase) {
  try {
    const provider = createNativeIntelligenceProvider();
    const registryContext = capabilities.map((cap) => introspectNodeContract(cap));
    const capabilityMap = new Map(capabilities.map((n) => [n.slug, n]));
    const pipelineSummary = {
      pipelineId: pipeline.pipelineId,
      executionMode: pipeline.executionMode,
      nodes: pipeline.nodes.map((node) => {
        const cap = capabilityMap.get(node.slug);
        const contract = cap ? introspectNodeContract(cap) : null;
        const missingRequired = [];
        if (contract) {
          for (const input2 of contract.inputs) {
            if (!input2.required)
              continue;
            const value = node.bindings[input2.key];
            if (value === void 0 || value === null || value === "") {
              missingRequired.push(input2.key);
            }
          }
        }
        return {
          slug: node.slug,
          bindingCount: Object.keys(node.bindings).length,
          missingRequired,
          outputTypes: contract?.outputTypes ?? [],
          assetCount: 0
        };
      }),
      warnings: []
    };
    const input = {
      pipeline: pipelineSummary,
      registryContext,
      phase
    };
    const result = await provider.summarizeExecution(input);
    const lines = [
      `${pc33.bold("Intelligence Summary")} ${pc33.dim(result.title)}`,
      result.explanation
    ];
    if (result.runtimeModeNote) {
      lines.push(`${pc33.dim("Runtime:")} ${result.runtimeModeNote}`);
    }
    if (result.outputExpectation) {
      lines.push(`${pc33.dim("Expected:")} ${result.outputExpectation}`);
    }
    if (result.missingBindingGuidance.length > 0) {
      lines.push("", pc33.yellow("Missing Binding Guidance"));
      for (const guidance of result.missingBindingGuidance) {
        lines.push(`  ${pc33.dim("\xB7")} ${guidance}`);
      }
    }
    if (result.costLatencyCautions.length > 0) {
      lines.push("", pc33.yellow("Cost/Latency Notes"));
      for (const caution of result.costLatencyCautions) {
        lines.push(`  ${pc33.dim("\xB7")} ${caution}`);
      }
    }
    if (result.warnings.length > 0) {
      lines.push("", pc33.yellow("Warnings"));
      for (const warning of result.warnings) {
        lines.push(`  ${pc33.dim("\xB7")} ${warning}`);
      }
    }
    return lines;
  } catch {
    return null;
  }
}
function registerWorkflowCommands(program2) {
  const wf = program2.command("workflow").description("Browse CMS contracts, dynamic pipelines, and saved workflows (requires auth)").addHelpText("after", `
Examples:
  $ growthub workflow                       # interactive workflow browser
  $ growthub pipeline assemble              # create new dynamic pipeline workflow
  $ growthub workflow saved                 # list saved workflows
`);
  wf.action(async () => {
    await runWorkflowPicker({});
  });
  const templatesCommandEnabled = false;
  if (templatesCommandEnabled) {
    wf.command("templates").description("List CMS workflow node starter templates").option("--family <family>", "Filter by family").option("--search <term>", "Search templates").option("--view <mode>", "List view mode: condensed | expanded | tree").option("--json", "Output raw JSON").action(async (opts) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc33.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }
      const registry = createCmsCapabilityRegistryClient();
      const query = {};
      if (opts.family)
        query.family = opts.family;
      if (opts.search)
        query.search = opts.search;
      try {
        const { nodes, meta } = await registry.listCapabilities(
          Object.keys(query).length > 0 ? query : void 0
        );
        if (opts.json) {
          console.log(JSON.stringify({ nodes, meta }, null, 2));
          return;
        }
        if (nodes.length === 0) {
          console.error(pc33.yellow("No templates found."));
          process.exitCode = 1;
          return;
        }
        const viewMode = opts.view ?? "condensed";
        console.log("");
        console.log(
          pc33.bold("Workflow Node Templates") + pc33.dim(`  ${nodes.length} template${nodes.length !== 1 ? "s" : ""}`)
        );
        console.log(hr6());
        console.log(pc33.bold("Step 1: CMS Node Contract Validation"));
        console.log(pc33.dim("Validate contract visibility before template selection."));
        console.log(pc33.dim(`View mode: ${viewMode}`));
        console.log("");
        if (viewMode === "tree") {
          console.log(box5(renderTemplateTree(nodes)));
          console.log(hr6());
          console.log(pc33.dim(`  Source: ${meta.source}  \xB7  growthub workflow`));
          console.log("");
          return;
        }
        for (const node of nodes) {
          const contract = introspectNodeContract(node);
          const requiredInputs = contract.inputs.filter((input) => input.required).length;
          const optionalInputs = contract.inputs.length - requiredInputs;
          const enabledTag = node.enabled ? pc33.green("enabled") : pc33.red("disabled");
          console.log(`  ${node.icon}  ${pc33.bold(node.displayName)}  ${pc33.dim(node.slug)}  ${enabledTag}`);
          console.log(
            `     ${pc33.dim("Contract:")} ${pc33.dim("required")}=${requiredInputs} ${pc33.dim("optional")}=${optionalInputs} ${pc33.dim("bindings")}=${contract.requiredBindings.length} ${pc33.dim("outputs")}=${contract.outputTypes.length}`
          );
          console.log(
            `     ${pc33.dim("Execution:")} ${contract.executionStrategy} \xB7 ${contract.executionKind}`
          );
          if (node.description) {
            console.log(`     ${pc33.dim(node.description)}`);
          }
          console.log("");
        }
        console.log(hr6());
        console.log(pc33.dim(`  Source: ${meta.source}  \xB7  growthub workflow`));
        console.log("");
      } catch (err) {
        console.error(pc33.red("Failed: " + err.message));
        process.exitCode = 1;
      }
    });
  }
  wf.command("saved").description("List saved workflow pipelines").option("--include-archived", "Include archived workflows in output").option("--json", "Output raw JSON").action(async (opts) => {
    const hygieneStore = createWorkflowHygieneStore();
    const saved = withEffectiveWorkflowLabels(
      enrichWorkflowSummaries(
        filterLocallyDeletedWorkflows(await listSavedWorkflows()),
        hygieneStore
      ),
      hygieneStore
    );
    const visibleSaved = opts.includeArchived ? saved : saved.filter((entry) => entry.workflowLabel !== "archived");
    if (opts.json) {
      console.log(JSON.stringify(visibleSaved, null, 2));
      return;
    }
    if (visibleSaved.length === 0) {
      console.log(pc33.dim("No saved workflows. Run `growthub workflow` to assemble one."));
      return;
    }
    console.log("");
    console.log(
      pc33.bold("Saved Workflows") + pc33.dim(`  ${visibleSaved.length} workflow${visibleSaved.length !== 1 ? "s" : ""}`)
    );
    if (!opts.includeArchived) {
      const hiddenArchivedCount = saved.length - visibleSaved.length;
      if (hiddenArchivedCount > 0) {
        console.log(pc33.dim(`  Archived hidden: ${hiddenArchivedCount} (use --include-archived to show)`));
      }
    }
    console.log(hr6());
    for (const w of visibleSaved) {
      console.log(
        `  ${pc33.bold(w.name)}  ` + pc33.dim(`[${renderWorkflowLabel(w.workflowLabel)}] `) + pc33.dim(`${w.nodeCount} node${w.nodeCount !== 1 ? "s" : ""}  \xB7  ${w.executionMode}  \xB7  ${w.updatedAt?.slice(0, 10) ?? w.createdAt.slice(0, 10)}`)
      );
    }
    console.log("");
    console.log(pc33.dim(`  Source: ${visibleSaved[0]?.source === "hosted" ? "hosted workflow registry" : resolveSavedWorkflowsDir()}`));
    console.log("");
  });
}

// src/commands/open-agents.ts
import * as p22 from "@clack/prompts";
import pc34 from "picocolors";

// src/runtime/agent-harness/auth-store.ts
init_home();
import fs24 from "node:fs";
import path32 from "node:path";
function resolveHarnessAuthDir() {
  return path32.resolve(resolvePaperclipHomeDir(), "harness-auth");
}
function resolveHarnessAuthFile(harnessId) {
  return path32.resolve(resolveHarnessAuthDir(), `${harnessId}.json`);
}
function normalizeSecret(value) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : void 0;
}
function ensureSecureDir(dirPath) {
  fs24.mkdirSync(dirPath, { recursive: true });
  try {
    fs24.chmodSync(dirPath, 448);
  } catch {
  }
}
function ensureSecureFile(filePath) {
  try {
    fs24.chmodSync(filePath, 384);
  } catch {
  }
}
function readHarnessCredentials(harnessId) {
  const filePath = resolveHarnessAuthFile(harnessId);
  if (!fs24.existsSync(filePath))
    return {};
  try {
    const parsed = JSON.parse(fs24.readFileSync(filePath, "utf-8"));
    const creds = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim().length > 0) {
        creds[key] = value;
      }
    }
    return creds;
  } catch {
    return {};
  }
}
function getHarnessCredential(harnessId, key) {
  const creds = readHarnessCredentials(harnessId);
  return creds[key];
}
function setHarnessCredential(harnessId, key, value) {
  const normalized = normalizeSecret(value);
  const creds = readHarnessCredentials(harnessId);
  if (normalized) {
    creds[key] = normalized;
  } else {
    delete creds[key];
  }
  const dirPath = resolveHarnessAuthDir();
  ensureSecureDir(dirPath);
  const filePath = resolveHarnessAuthFile(harnessId);
  fs24.writeFileSync(filePath, `${JSON.stringify(creds, null, 2)}
`, "utf-8");
  ensureSecureFile(filePath);
}
function setHarnessCredentials(harnessId, updates) {
  const creds = readHarnessCredentials(harnessId);
  for (const [key, rawValue] of Object.entries(updates)) {
    const normalized = normalizeSecret(rawValue);
    if (normalized) {
      creds[key] = normalized;
    } else {
      delete creds[key];
    }
  }
  const dirPath = resolveHarnessAuthDir();
  ensureSecureDir(dirPath);
  const filePath = resolveHarnessAuthFile(harnessId);
  fs24.writeFileSync(filePath, `${JSON.stringify(creds, null, 2)}
`, "utf-8");
  ensureSecureFile(filePath);
}
function maskSecret(value) {
  if (!value)
    return "(not set)";
  if (value.length <= 4)
    return "****";
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

// src/runtime/open-agents/index.ts
init_home();
import fs25 from "node:fs";
import path33 from "node:path";

// src/runtime/open-agents/contract.ts
var DEFAULT_OPEN_AGENTS_CONFIG = {
  backendType: "local",
  authMode: "none",
  endpoint: "http://localhost:3000",
  sandboxTimeoutMs: 3e5,
  timeoutMs: 3e4
};

// src/runtime/open-agents/provider.ts
async function checkOpenAgentsHealth(config) {
  const startMs = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5e3);
    try {
      const url = `${config.endpoint.replace(/\/$/, "")}/api/health`;
      const headers = {
        accept: "application/json",
        ...config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}
      };
      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal
      });
      const latencyMs = Date.now() - startMs;
      if (!response.ok) {
        return {
          available: false,
          latencyMs,
          error: `Backend responded with ${response.status}: ${response.statusText}`
        };
      }
      const data = await response.json().catch(() => ({}));
      return {
        available: true,
        latencyMs,
        version: typeof data.version === "string" ? data.version : void 0
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    return {
      available: false,
      latencyMs,
      error: err instanceof Error ? err.message : "Unknown error"
    };
  }
}
async function listOpenAgentsSessions(config) {
  const url = `${config.endpoint.replace(/\/$/, "")}/api/sessions`;
  const headers = {
    accept: "application/json",
    ...config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 3e4
  );
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new OpenAgentsBackendError(
        response.status,
        `Failed to list sessions: ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();
    return data.sessions ?? [];
  } finally {
    clearTimeout(timeoutId);
  }
}
async function createOpenAgentsSession(config, input) {
  const url = `${config.endpoint.replace(/\/$/, "")}/api/sessions`;
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    ...config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}
  };
  const body = {
    prompt: input.prompt
  };
  if (input.repoUrl)
    body.repoUrl = input.repoUrl;
  if (input.branch)
    body.branch = input.branch;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 3e4
  );
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const errorText4 = await response.text().catch(() => "");
      throw new OpenAgentsBackendError(
        response.status,
        `Failed to create session: ${response.status} ${errorText4 || response.statusText}`
      );
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
async function resumeOpenAgentsSession(config, sessionId) {
  const url = `${config.endpoint.replace(/\/$/, "")}/api/sessions/${encodeURIComponent(sessionId)}`;
  const headers = {
    accept: "application/json",
    ...config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 3e4
  );
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new OpenAgentsBackendError(
        response.status,
        `Failed to resume session: ${response.status} ${response.statusText}`
      );
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
async function pollSessionEvents(config, sessionId, afterTimestamp) {
  const base = `${config.endpoint.replace(/\/$/, "")}/api/sessions/${encodeURIComponent(sessionId)}/events`;
  const url = afterTimestamp ? `${base}?after=${encodeURIComponent(afterTimestamp)}` : base;
  const headers = {
    accept: "application/json",
    ...config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 3e4
  );
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new OpenAgentsBackendError(
        response.status,
        `Failed to poll events: ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();
    return data.events ?? [];
  } finally {
    clearTimeout(timeoutId);
  }
}
var OpenAgentsBackendError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};

// src/runtime/open-agents/index.ts
function resolveConfigPath3() {
  return path33.resolve(resolvePaperclipHomeDir(), "open-agents", "config.json");
}
function readOpenAgentsConfig() {
  const configPath = resolveConfigPath3();
  if (!fs25.existsSync(configPath)) {
    return {
      ...DEFAULT_OPEN_AGENTS_CONFIG,
      apiKey: getHarnessCredential("open-agents", "apiKey")
    };
  }
  try {
    const raw = JSON.parse(fs25.readFileSync(configPath, "utf-8"));
    const storedApiKey = getHarnessCredential("open-agents", "apiKey");
    return {
      backendType: validateBackendType(raw.backendType),
      authMode: validateAuthMode(raw.authMode),
      endpoint: typeof raw.endpoint === "string" ? raw.endpoint : DEFAULT_OPEN_AGENTS_CONFIG.endpoint,
      apiKey: storedApiKey ?? (typeof raw.apiKey === "string" ? raw.apiKey : void 0),
      defaultRepo: typeof raw.defaultRepo === "string" ? raw.defaultRepo : void 0,
      defaultBranch: typeof raw.defaultBranch === "string" ? raw.defaultBranch : void 0,
      sandboxTimeoutMs: typeof raw.sandboxTimeoutMs === "number" ? raw.sandboxTimeoutMs : DEFAULT_OPEN_AGENTS_CONFIG.sandboxTimeoutMs,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_OPEN_AGENTS_CONFIG.timeoutMs
    };
  } catch {
    return {
      ...DEFAULT_OPEN_AGENTS_CONFIG,
      apiKey: getHarnessCredential("open-agents", "apiKey")
    };
  }
}
function writeOpenAgentsConfig(config) {
  const configPath = resolveConfigPath3();
  fs25.mkdirSync(path33.dirname(configPath), { recursive: true });
  const persisted = {
    ...config,
    authMode: validateAuthMode(config.authMode),
    apiKey: void 0
  };
  fs25.writeFileSync(configPath, `${JSON.stringify(persisted, null, 2)}
`, "utf-8");
  setHarnessCredential("open-agents", "apiKey", config.apiKey);
}
function validateBackendType(value) {
  if (value === "local" || value === "hosted")
    return value;
  return "local";
}
function validateAuthMode(value) {
  if (value === "none" || value === "api-key" || value === "vercel-managed") {
    return value;
  }
  return "none";
}

// src/commands/open-agents.ts
init_banner();
function statusColor2(status) {
  if (status === "running")
    return pc34.green(status);
  if (status === "completed")
    return pc34.cyan(status);
  if (status === "failed" || status === "cancelled")
    return pc34.red(status);
  if (status === "waiting" || status === "idle")
    return pc34.yellow(status);
  return pc34.dim(status);
}
function sandboxBadge(state) {
  if (state === "running")
    return pc34.green("running");
  if (state === "hibernating")
    return pc34.yellow("hibernating");
  if (state === "stopped")
    return pc34.dim("stopped");
  if (state === "error")
    return pc34.red("error");
  return pc34.dim(state);
}
function hr7(width = 72) {
  return pc34.dim("\u2500".repeat(width));
}
function stripAnsi6(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}
function box6(lines) {
  const padded = lines.map((l) => "  " + l);
  const width = Math.max(...padded.map((l) => stripAnsi6(l).length)) + 4;
  const top = pc34.dim("\u250C" + "\u2500".repeat(width) + "\u2510");
  const bottom = pc34.dim("\u2514" + "\u2500".repeat(width) + "\u2518");
  const body = padded.map((l) => {
    const pad = width - stripAnsi6(l).length;
    return pc34.dim("\u2502") + l + " ".repeat(pad) + pc34.dim("\u2502");
  });
  return [top, ...body, bottom].join("\n");
}
function printSessionCard(session) {
  const lines = [
    `${pc34.bold("Session")}  ${pc34.dim(session.sessionId)}`,
    `${pc34.dim("Status:")}   ${statusColor2(session.status)}`,
    `${pc34.dim("Sandbox:")}  ${sandboxBadge(session.sandboxState)}`,
    `${pc34.dim("Events:")}   ${session.eventCount}`,
    `${pc34.dim("Created:")}  ${session.createdAt}`
  ];
  if (session.repoUrl)
    lines.push(`${pc34.dim("Repo:")}     ${session.repoUrl}`);
  if (session.branch)
    lines.push(`${pc34.dim("Branch:")}   ${session.branch}`);
  if (session.prompt) {
    const truncated = session.prompt.length > 80 ? session.prompt.slice(0, 77) + "..." : session.prompt;
    lines.push(`${pc34.dim("Prompt:")}   ${truncated}`);
  }
  console.log("");
  console.log(box6(lines));
  console.log("");
}
var EVENT_EMOJI = {
  sandbox_create: "\u{1F4E6}",
  sandbox_resume: "\u25B6\uFE0F ",
  sandbox_hibernate: "\u{1F4A4}",
  tool_start: "\u{1F527}",
  tool_result: "\u2705",
  file_edit: "\u{1F4DD}",
  file_create: "\u{1F4C4}",
  shell_exec: "\u{1F4BB}",
  search: "\u{1F50D}",
  git_commit: "\u{1F4CC}",
  git_push: "\u{1F680}",
  git_pr: "\u{1F517}",
  agent_message: "\u{1F4AC}",
  agent_thinking: "\u{1F9E0}",
  task_delegate: "\u{1F4CB}",
  workflow_step: "\u2699\uFE0F ",
  error: "\u274C"
};
function printEvent(event) {
  const emoji = EVENT_EMOJI[event.type] ?? "\xB7";
  const ts = pc34.dim(event.timestamp.split("T")[1]?.slice(0, 8) ?? "");
  console.log(`  ${emoji}  ${ts}  ${event.detail}`);
}
async function runOpenAgentsHub(opts) {
  printPaperclipCliBanner();
  p22.intro(pc34.bold("Open Agents"));
  while (true) {
    const config = readOpenAgentsConfig();
    const action = await p22.select({
      message: "Open Agents",
      options: [
        { value: "setup", label: "Setup & Configure", hint: "backend endpoint, API key, defaults" },
        { value: "health", label: "Health Check", hint: `check ${config.endpoint}` },
        { value: "list", label: "List Sessions", hint: "browse existing agent sessions" },
        { value: "create", label: "Prompt (Create Session)", hint: "submit a task prompt and start a durable run" },
        { value: "resume", label: "Chat (Resume Session)", hint: "reconnect to a session and continue the conversation" },
        ...opts?.allowBackToHub ? [{ value: "__back_to_hub", label: "\u2190 Back to harness type" }] : []
      ]
    });
    if (p22.isCancel(action) || action === "__back_to_hub")
      return "back";
    if (action === "setup") {
      await runSetupFlow(config);
      continue;
    }
    if (action === "health") {
      const spinner10 = p22.spinner();
      spinner10.start(`Checking ${config.endpoint}...`);
      const health = await checkOpenAgentsHealth(config);
      if (health.available) {
        spinner10.stop(
          `Backend reachable (${health.latencyMs}ms)` + (health.version ? `  version: ${health.version}` : "")
        );
      } else {
        spinner10.stop(`Backend unavailable (${health.latencyMs}ms)`);
        p22.note(
          [
            health.error ? `Error: ${health.error}` : "",
            "",
            "Quick setup:",
            `  1) git clone https://github.com/vercel-labs/open-agents`,
            `  2) cd open-agents && bun install`,
            `  3) bun run web`,
            `  4) growthub open-agents config --endpoint http://localhost:3000`,
            "",
            "Hosted auth guidance:",
            "  - Use auth mode 'vercel-managed' when your deployment handles auth upstream.",
            "  - Use auth mode 'api-key' to store a bearer token in local secure harness storage."
          ].filter(Boolean).join("\n"),
          "Open Agents Setup"
        );
      }
      continue;
    }
    if (action === "list") {
      const listResult = await runSessionListFlow(config);
      if (listResult === "back")
        continue;
      return "done";
    }
    if (action === "create") {
      await runCreateSessionFlow(config);
      continue;
    }
    if (action === "resume") {
      await runResumeSessionFlow(config);
      continue;
    }
  }
}
async function runSetupFlow(currentConfig) {
  const backendChoice = await p22.select({
    message: "Backend type",
    options: [
      { value: "local", label: "Local", hint: "open-agents dev server on this machine" },
      { value: "hosted", label: "Hosted", hint: "deployed Vercel instance" }
    ],
    initialValue: currentConfig.backendType
  });
  if (p22.isCancel(backendChoice))
    return;
  const authMode = backendChoice === "hosted" ? await p22.select({
    message: "Hosted authentication strategy",
    options: [
      {
        value: "api-key",
        label: "Bearer API key",
        hint: "Recommended for CLI-safe server-to-server access"
      },
      {
        value: "vercel-managed",
        label: "Vercel-managed / gateway auth",
        hint: "No CLI key; auth is handled upstream by your deployment"
      }
    ],
    initialValue: currentConfig.authMode === "api-key" || currentConfig.authMode === "vercel-managed" ? currentConfig.authMode : "api-key"
  }) : "none";
  if (p22.isCancel(authMode))
    return;
  const endpoint = await p22.text({
    message: "Backend endpoint",
    placeholder: currentConfig.endpoint,
    initialValue: currentConfig.endpoint
  });
  if (p22.isCancel(endpoint))
    return;
  let apiKeyValue;
  if (authMode === "api-key") {
    const existingKeyMasked = maskSecret(currentConfig.apiKey);
    const apiKeyMode = await p22.select({
      message: `API key (${existingKeyMasked})`,
      options: [
        { value: "keep", label: "Keep existing key", hint: "No change to currently stored key" },
        { value: "replace", label: "Replace key", hint: "Enter a new key and store it securely" },
        { value: "clear", label: "Clear key", hint: "Remove any stored key for this harness" }
      ],
      initialValue: currentConfig.apiKey ? "keep" : "replace"
    });
    if (p22.isCancel(apiKeyMode))
      return;
    if (apiKeyMode === "replace") {
      const entered = await p22.password({
        message: "Open Agents API key"
      });
      if (p22.isCancel(entered))
        return;
      apiKeyValue = String(entered).trim() || void 0;
    } else if (apiKeyMode === "keep") {
      apiKeyValue = currentConfig.apiKey;
    } else {
      apiKeyValue = void 0;
    }
  } else {
    apiKeyValue = void 0;
  }
  const defaultRepo = await p22.text({
    message: "Default repository URL (optional)",
    placeholder: currentConfig.defaultRepo ?? "",
    initialValue: currentConfig.defaultRepo ?? ""
  });
  if (p22.isCancel(defaultRepo))
    return;
  const confirmed = await p22.confirm({
    message: "Save Open Agents configuration?",
    initialValue: true
  });
  if (p22.isCancel(confirmed) || !confirmed)
    return;
  const newConfig = {
    ...currentConfig,
    backendType: backendChoice,
    authMode,
    endpoint: String(endpoint).trim() || currentConfig.endpoint,
    apiKey: apiKeyValue,
    defaultRepo: String(defaultRepo).trim() || void 0
  };
  writeOpenAgentsConfig(newConfig);
  p22.log.success("Configuration saved.");
}
async function runSessionListFlow(config) {
  const spinner10 = p22.spinner();
  spinner10.start("Loading sessions...");
  let sessions;
  try {
    sessions = await listOpenAgentsSessions(config);
  } catch (err) {
    spinner10.stop("Failed to load sessions.");
    p22.log.error(err.message);
    return "back";
  }
  spinner10.stop(`${sessions.length} session${sessions.length !== 1 ? "s" : ""} found.`);
  if (sessions.length === 0) {
    p22.note("No agent sessions found. Create one to get started.", "Nothing found");
    return "back";
  }
  while (true) {
    const sessionChoice = await p22.select({
      message: "Select a session",
      options: [
        ...sessions.map((s) => ({
          value: s.sessionId,
          label: `${statusColor2(s.status)}  ${pc34.dim(s.sessionId.slice(0, 12))}`,
          hint: s.prompt ? s.prompt.slice(0, 50) : void 0
        })),
        { value: "__back", label: "\u2190 Back" }
      ]
    });
    if (p22.isCancel(sessionChoice) || sessionChoice === "__back")
      return "back";
    const selected = sessions.find((s) => s.sessionId === sessionChoice);
    if (!selected)
      continue;
    printSessionCard(selected);
    const nextStep = await p22.select({
      message: "What next?",
      options: [
        { value: "events", label: "\u{1F4DC} View recent events" },
        { value: "back_to_list", label: "\u2190 Back to session list" }
      ]
    });
    if (p22.isCancel(nextStep) || nextStep === "back_to_list")
      continue;
    if (nextStep === "events") {
      try {
        const events = await pollSessionEvents(config, selected.sessionId);
        if (events.length === 0) {
          p22.note("No events recorded yet.", "Empty");
        } else {
          console.log("");
          console.log(pc34.bold("Recent Events") + pc34.dim(`  (${events.length})`));
          console.log(hr7());
          for (const event of events.slice(-20)) {
            printEvent(event);
          }
          console.log(hr7());
          console.log("");
        }
      } catch (err) {
        p22.log.error("Failed to load events: " + err.message);
      }
    }
  }
}
async function runCreateSessionFlow(config) {
  const prompt = await p22.text({
    message: "What should the agent do?",
    placeholder: "Describe the task for the agent"
  });
  if (p22.isCancel(prompt) || !String(prompt).trim())
    return;
  const repoUrl = await p22.text({
    message: "Repository URL (optional)",
    placeholder: config.defaultRepo ?? "https://github.com/org/repo",
    initialValue: config.defaultRepo ?? ""
  });
  if (p22.isCancel(repoUrl))
    return;
  const branch = await p22.text({
    message: "Branch (optional)",
    placeholder: config.defaultBranch ?? "main",
    initialValue: config.defaultBranch ?? ""
  });
  if (p22.isCancel(branch))
    return;
  const confirmed = await p22.confirm({
    message: "Create agent session?",
    initialValue: true
  });
  if (p22.isCancel(confirmed) || !confirmed)
    return;
  const spinner10 = p22.spinner();
  spinner10.start("Creating session...");
  try {
    const session = await createOpenAgentsSession(config, {
      prompt: String(prompt).trim(),
      repoUrl: String(repoUrl).trim() || void 0,
      branch: String(branch).trim() || void 0
    });
    spinner10.stop("Session created.");
    printSessionCard(session);
  } catch (err) {
    spinner10.stop("Failed to create session.");
    p22.log.error(err.message);
  }
}
async function runResumeSessionFlow(config) {
  const sessionId = await p22.text({
    message: "Session ID",
    placeholder: "Paste the session ID to resume"
  });
  if (p22.isCancel(sessionId) || !String(sessionId).trim())
    return;
  const spinner10 = p22.spinner();
  spinner10.start("Resuming session...");
  try {
    const session = await resumeOpenAgentsSession(config, String(sessionId).trim());
    spinner10.stop("Session resumed.");
    printSessionCard(session);
    const events = await pollSessionEvents(config, session.sessionId);
    if (events.length > 0) {
      console.log(pc34.bold("Latest Events") + pc34.dim(`  (${events.length})`));
      console.log(hr7());
      for (const event of events.slice(-20)) {
        printEvent(event);
      }
      console.log(hr7());
      console.log("");
    }
  } catch (err) {
    spinner10.stop("Failed to resume session.");
    p22.log.error(err.message);
  }
}
function registerOpenAgentsCommands(program2) {
  const oa = program2.command("open-agents").description("Durable agent workflow orchestration via Open Agents harness").addHelpText("after", `
Examples:
  $ growthub open-agents                     # interactive browser
  $ growthub open-agents config              # show current configuration
  $ growthub open-agents config --endpoint http://localhost:3000
  $ growthub open-agents status              # check backend health
  $ growthub open-agents list                # list agent sessions
  $ growthub open-agents list --json         # machine-readable output
  $ growthub open-agents create              # create new session (interactive)
  $ growthub open-agents prompt "fix tests"  # prompt and start a session
  $ growthub open-agents chat <session-id>   # chat/resume an existing session
  $ growthub open-agents resume <session-id> # resume existing session
`);
  oa.action(async () => {
    await runOpenAgentsHub({});
  });
  oa.command("config").description("Show or update Open Agents backend configuration").option("--endpoint <url>", "Backend endpoint URL").option("--api-key <key>", "API key for authenticated backends").option("--auth-mode <mode>", "Auth mode: none | api-key | vercel-managed").option("--clear-api-key", "Clear stored API key").option("--default-repo <url>", "Default repository URL for new sessions").option("--default-branch <name>", "Default branch name for new sessions").option("--json", "Output raw JSON").action(async (opts) => {
    const config = readOpenAgentsConfig();
    const hasUpdate = opts.endpoint || opts.apiKey || opts.clearApiKey || opts.defaultRepo || opts.defaultBranch || opts.authMode;
    if (hasUpdate) {
      const nextAuthMode = opts.authMode === "none" || opts.authMode === "api-key" || opts.authMode === "vercel-managed" ? opts.authMode : config.authMode;
      const updated = {
        ...config,
        ...nextAuthMode ? { authMode: nextAuthMode } : {},
        ...opts.endpoint ? { endpoint: opts.endpoint } : {},
        ...opts.apiKey || opts.clearApiKey ? { apiKey: opts.clearApiKey ? void 0 : opts.apiKey } : {},
        ...opts.defaultRepo ? { defaultRepo: opts.defaultRepo } : {},
        ...opts.defaultBranch ? { defaultBranch: opts.defaultBranch } : {}
      };
      writeOpenAgentsConfig(updated);
      if (opts.json) {
        console.log(JSON.stringify(updated, null, 2));
      } else {
        console.log(pc34.green("Configuration updated."));
      }
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }
    console.log("");
    console.log(pc34.bold("Open Agents Configuration"));
    console.log(hr7());
    console.log(`  ${pc34.dim("Backend:")}   ${config.backendType}`);
    console.log(`  ${pc34.dim("Auth Mode:")} ${config.authMode ?? "none"}`);
    console.log(`  ${pc34.dim("Endpoint:")}  ${config.endpoint}`);
    console.log(`  ${pc34.dim("API Key:")}   ${config.apiKey ? maskSecret(config.apiKey) : pc34.dim("(none)")}`);
    console.log(`  ${pc34.dim("Repo:")}      ${config.defaultRepo ?? pc34.dim("(none)")}`);
    console.log(`  ${pc34.dim("Branch:")}    ${config.defaultBranch ?? pc34.dim("(none)")}`);
    console.log(`  ${pc34.dim("Timeout:")}   ${config.timeoutMs ?? 3e4}ms`);
    console.log(hr7());
    console.log("");
  });
  oa.command("status").description("Check Open Agents backend health").option("--json", "Output raw JSON").action(async (opts) => {
    const config = readOpenAgentsConfig();
    const health = await checkOpenAgentsHealth(config);
    if (opts.json) {
      console.log(JSON.stringify(health, null, 2));
      return;
    }
    if (health.available) {
      console.log(
        pc34.green("\u2713") + ` Backend reachable at ${config.endpoint} (${health.latencyMs}ms)` + (health.version ? `  version: ${health.version}` : "")
      );
    } else {
      console.log(pc34.red("\u2717") + ` Backend unavailable at ${config.endpoint} (${health.latencyMs}ms)`);
      if (health.error) {
        console.log(pc34.dim(`  ${health.error}`));
      }
      process.exitCode = 1;
    }
  });
  oa.command("list").description("List agent sessions").option("--json", "Output raw JSON for scripting").action(async (opts) => {
    const config = readOpenAgentsConfig();
    try {
      const sessions = await listOpenAgentsSessions(config);
      if (opts.json) {
        console.log(JSON.stringify({ sessions }, null, 2));
        return;
      }
      if (sessions.length === 0) {
        console.log(pc34.yellow("No sessions found.") + pc34.dim(" Run `growthub open-agents create` to start one."));
        return;
      }
      console.log("");
      console.log(pc34.bold("Agent Sessions") + pc34.dim(`  (${sessions.length})`));
      console.log(hr7());
      for (const session of sessions) {
        const truncatedPrompt = session.prompt ? pc34.dim(session.prompt.slice(0, 50)) : "";
        console.log(
          `  ${statusColor2(session.status)}  ${pc34.dim(session.sessionId.slice(0, 12))}  ${sandboxBadge(session.sandboxState)}  ${truncatedPrompt}`
        );
      }
      console.log(hr7());
      console.log("");
    } catch (err) {
      console.error(pc34.red("Failed to list sessions: " + err.message));
      process.exitCode = 1;
    }
  });
  oa.command("create").description("Create a new agent session").option("--prompt <text>", "Task prompt for the agent").option("--repo <url>", "Repository URL").option("--branch <name>", "Branch name").option("--json", "Output raw JSON").action(async (opts) => {
    const config = readOpenAgentsConfig();
    if (!opts.prompt) {
      await runCreateSessionFlow(config);
      return;
    }
    try {
      const session = await createOpenAgentsSession(config, {
        prompt: opts.prompt,
        repoUrl: opts.repo ?? config.defaultRepo,
        branch: opts.branch ?? config.defaultBranch
      });
      if (opts.json) {
        console.log(JSON.stringify(session, null, 2));
        return;
      }
      printSessionCard(session);
    } catch (err) {
      console.error(pc34.red("Failed to create session: " + err.message));
      process.exitCode = 1;
    }
  });
  oa.command("prompt").description("Create a new session from a prompt (prompt-first alias)").argument("<prompt>", "Task prompt for the agent").option("--repo <url>", "Repository URL").option("--branch <name>", "Branch name").option("--json", "Output raw JSON").action(async (prompt, opts) => {
    const config = readOpenAgentsConfig();
    try {
      const session = await createOpenAgentsSession(config, {
        prompt,
        repoUrl: opts.repo ?? config.defaultRepo,
        branch: opts.branch ?? config.defaultBranch
      });
      if (opts.json) {
        console.log(JSON.stringify(session, null, 2));
        return;
      }
      printSessionCard(session);
    } catch (err) {
      console.error(pc34.red("Failed to create session: " + err.message));
      process.exitCode = 1;
    }
  });
  oa.command("resume").description("Resume an existing agent session").argument("<sessionId>", "Session ID to resume").option("--json", "Output raw JSON").action(async (sessionId, opts) => {
    const config = readOpenAgentsConfig();
    try {
      const session = await resumeOpenAgentsSession(config, sessionId);
      if (opts.json) {
        console.log(JSON.stringify(session, null, 2));
        return;
      }
      printSessionCard(session);
      const events = await pollSessionEvents(config, session.sessionId);
      if (events.length > 0) {
        console.log(pc34.bold("Latest Events") + pc34.dim(`  (${events.length})`));
        console.log(hr7());
        for (const event of events.slice(-20)) {
          printEvent(event);
        }
        console.log(hr7());
        console.log("");
      }
    } catch (err) {
      console.error(pc34.red("Failed to resume session: " + err.message));
      process.exitCode = 1;
    }
  });
  oa.command("chat").description("Chat by resuming an existing Open Agents session").argument("<sessionId>", "Session ID to resume").option("--json", "Output raw JSON").action(async (sessionId, opts) => {
    const config = readOpenAgentsConfig();
    try {
      const session = await resumeOpenAgentsSession(config, sessionId);
      if (opts.json) {
        console.log(JSON.stringify(session, null, 2));
        return;
      }
      printSessionCard(session);
      const events = await pollSessionEvents(config, session.sessionId);
      if (events.length > 0) {
        console.log(pc34.bold("Latest Events") + pc34.dim(`  (${events.length})`));
        console.log(hr7());
        for (const event of events.slice(-20)) {
          printEvent(event);
        }
        console.log(hr7());
        console.log("");
      }
    } catch (err) {
      console.error(pc34.red("Failed to chat/resume session: " + err.message));
      process.exitCode = 1;
    }
  });
}

// src/commands/qwen-code.ts
import * as p23 from "@clack/prompts";
import pc35 from "picocolors";

// src/runtime/qwen-code/index.ts
init_home();
import fs26 from "node:fs";
import path34 from "node:path";

// src/runtime/qwen-code/contract.ts
var QWEN_CODE_APPROVAL_MODES = [
  "default",
  "auto-edit",
  "yolo"
];
var QWEN_CODE_SUPPORTED_ENV_KEYS = [
  "DASHSCOPE_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY"
];
var DEFAULT_QWEN_CODE_CONFIG = {
  binaryPath: "qwen",
  defaultModel: "qwen3-coder",
  cwd: process.cwd(),
  approvalMode: "default",
  maxSessionTurns: 0,
  timeoutMs: 12e4,
  env: {}
};

// src/runtime/qwen-code/provider.ts
import { spawn as spawn2, spawnSync } from "node:child_process";
async function executeHeadlessPrompt(prompt, configOverride) {
  const config = { ...DEFAULT_QWEN_CODE_CONFIG, ...configOverride };
  const startMs = Date.now();
  const args = ["-p", prompt];
  if (config.defaultModel) {
    args.push("--model", config.defaultModel);
  }
  if (config.approvalMode === "yolo") {
    args.push("--yolo");
  }
  if (config.maxSessionTurns > 0) {
    args.push("--max-turns", String(config.maxSessionTurns));
  }
  const env = {
    ...process.env,
    ...config.env
  };
  return new Promise((resolve2) => {
    const child = spawn2(config.binaryPath, args, {
      cwd: config.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeoutHandle = config.timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed)
          child.kill("SIGKILL");
      }, 5e3);
    }, config.timeoutMs) : null;
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (exitCode, signal) => {
      if (timeoutHandle)
        clearTimeout(timeoutHandle);
      resolve2({
        exitCode,
        timedOut,
        stdout,
        stderr,
        durationMs: Date.now() - startMs,
        signal: signal ?? null
      });
    });
    child.on("error", (err) => {
      if (timeoutHandle)
        clearTimeout(timeoutHandle);
      resolve2({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: stderr + (err.message ?? "spawn error"),
        durationMs: Date.now() - startMs,
        signal: null
      });
    });
  });
}
function launchInteractiveSession(configOverride) {
  const config = { ...DEFAULT_QWEN_CODE_CONFIG, ...configOverride };
  const args = [];
  if (config.defaultModel) {
    args.push("--model", config.defaultModel);
  }
  if (config.approvalMode === "yolo") {
    args.push("--yolo");
  }
  const env = {
    ...process.env,
    ...config.env
  };
  const result = spawnSync(config.binaryPath, args, {
    cwd: config.cwd,
    env,
    stdio: "inherit"
  });
  return { exitCode: result.status };
}
function detectQwenVersion(binaryPath = "qwen") {
  try {
    const result = spawnSync(binaryPath, ["--version"], {
      timeout: 1e4,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.status === 0 && result.stdout) {
      const versionMatch = result.stdout.trim().match(/(\d+\.\d+\.\d+)/);
      return {
        found: true,
        version: versionMatch ? versionMatch[1] : result.stdout.trim(),
        resolvedPath: binaryPath
      };
    }
    return { found: false, version: null, resolvedPath: binaryPath };
  } catch {
    return { found: false, version: null, resolvedPath: binaryPath };
  }
}

// src/runtime/qwen-code/health.ts
function detectEnvironment(binaryPath = "qwen", runtimeEnv = {}) {
  const osLabel = process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux";
  const versionInfo = detectQwenVersion(binaryPath);
  const nodeVersion = process.version.replace(/^v/, "");
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0], 10);
  const nodeVersionSufficient = nodeMajor >= 20;
  const mergedEnv = {
    ...runtimeEnv,
    ...process.env
  };
  const apiKeyConfigured = Boolean(
    mergedEnv.DASHSCOPE_API_KEY?.trim() || mergedEnv.OPENAI_API_KEY?.trim() || mergedEnv.ANTHROPIC_API_KEY?.trim() || mergedEnv.GOOGLE_API_KEY?.trim()
  );
  return {
    binaryFound: versionInfo.found,
    binaryVersion: versionInfo.version,
    binaryPath: versionInfo.resolvedPath,
    nodeVersionSufficient,
    nodeVersion,
    apiKeyConfigured,
    osLabel
  };
}
function checkHealth(binaryPath = "qwen", runtimeEnv = {}) {
  const environment = detectEnvironment(binaryPath, runtimeEnv);
  if (!environment.binaryFound) {
    return {
      status: "unavailable",
      environment,
      summary: `Qwen Code CLI not found at "${binaryPath}". Install with: npm install -g @qwen-code/qwen-code`
    };
  }
  if (!environment.nodeVersionSufficient) {
    return {
      status: "unavailable",
      environment,
      summary: `Node.js ${environment.nodeVersion} detected but Qwen Code requires >= 20.0.0.`
    };
  }
  if (!environment.apiKeyConfigured) {
    return {
      status: "degraded",
      environment,
      summary: `Qwen Code CLI v${environment.binaryVersion} found but no API key configured. Set DASHSCOPE_API_KEY or another supported provider key.`
    };
  }
  return {
    status: "available",
    environment,
    summary: `Qwen Code CLI v${environment.binaryVersion} ready (Node ${environment.nodeVersion}).`
  };
}
function buildSetupGuidance(env) {
  const lines = [];
  lines.push(`OS: ${env.osLabel}`);
  lines.push(`Qwen CLI: ${env.binaryFound ? `v${env.binaryVersion}` : "not found"}`);
  lines.push(`Node.js: v${env.nodeVersion} (${env.nodeVersionSufficient ? "OK" : "needs >= 20"})`);
  lines.push(`API key: ${env.apiKeyConfigured ? "configured" : "not configured"}`);
  lines.push("");
  if (!env.binaryFound) {
    if (env.osLabel === "macOS") {
      lines.push("Install Qwen Code (macOS):");
      lines.push("  brew install qwen-code");
      lines.push("  \u2014 or \u2014");
      lines.push("  npm install -g @qwen-code/qwen-code@latest");
    } else if (env.osLabel === "Windows") {
      lines.push("Install Qwen Code (Windows):");
      lines.push("  npm install -g @qwen-code/qwen-code@latest");
    } else {
      lines.push("Install Qwen Code (Linux):");
      lines.push("  npm install -g @qwen-code/qwen-code@latest");
    }
    lines.push("");
  }
  if (!env.apiKeyConfigured) {
    lines.push("Configure an API key:");
    lines.push("  (You can save this securely via: growthub qwen-code -> Configure)");
    lines.push("  export DASHSCOPE_API_KEY=<your-dashscope-key>");
    lines.push("  \u2014 or \u2014");
    lines.push("  export OPENAI_API_KEY=<your-openai-compatible-key>");
    lines.push("");
  }
  return lines;
}

// src/runtime/qwen-code/index.ts
function resolveConfigPath4() {
  return path34.resolve(resolvePaperclipHomeDir(), "qwen-code", "config.json");
}
function readQwenCodeConfig() {
  const configPath = resolveConfigPath4();
  const storedCredentials = readHarnessCredentials("qwen-code");
  if (!fs26.existsSync(configPath)) {
    return {
      ...DEFAULT_QWEN_CODE_CONFIG,
      env: mergeHarnessEnv(DEFAULT_QWEN_CODE_CONFIG.env, storedCredentials)
    };
  }
  try {
    const raw = JSON.parse(fs26.readFileSync(configPath, "utf-8"));
    return {
      binaryPath: typeof raw.binaryPath === "string" ? raw.binaryPath : DEFAULT_QWEN_CODE_CONFIG.binaryPath,
      defaultModel: typeof raw.defaultModel === "string" ? raw.defaultModel : DEFAULT_QWEN_CODE_CONFIG.defaultModel,
      cwd: typeof raw.cwd === "string" ? raw.cwd : DEFAULT_QWEN_CODE_CONFIG.cwd,
      approvalMode: raw.approvalMode === "default" || raw.approvalMode === "auto-edit" || raw.approvalMode === "yolo" ? raw.approvalMode : DEFAULT_QWEN_CODE_CONFIG.approvalMode,
      maxSessionTurns: typeof raw.maxSessionTurns === "number" ? raw.maxSessionTurns : DEFAULT_QWEN_CODE_CONFIG.maxSessionTurns,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_QWEN_CODE_CONFIG.timeoutMs,
      env: mergeHarnessEnv(
        typeof raw.env === "object" && raw.env !== null ? raw.env : DEFAULT_QWEN_CODE_CONFIG.env,
        storedCredentials
      )
    };
  } catch {
    return {
      ...DEFAULT_QWEN_CODE_CONFIG,
      env: mergeHarnessEnv(DEFAULT_QWEN_CODE_CONFIG.env, storedCredentials)
    };
  }
}
function writeQwenCodeConfig(config) {
  const configPath = resolveConfigPath4();
  fs26.mkdirSync(path34.dirname(configPath), { recursive: true });
  const rawEnv = typeof config.env === "object" && config.env !== null ? config.env : {};
  const credentialUpdates = {};
  const publicEnv = {};
  for (const [key, value] of Object.entries(rawEnv)) {
    if (QWEN_CODE_SUPPORTED_ENV_KEYS.includes(key)) {
      credentialUpdates[key] = value;
      continue;
    }
    publicEnv[key] = value;
  }
  setHarnessCredentials("qwen-code", credentialUpdates);
  fs26.writeFileSync(
    configPath,
    `${JSON.stringify({ ...config, env: publicEnv }, null, 2)}
`,
    "utf-8"
  );
}
function mergeHarnessEnv(runtimeEnv, credentials) {
  const merged = {};
  for (const [key, value] of Object.entries(runtimeEnv)) {
    if (typeof value === "string")
      merged[key] = value;
  }
  for (const key of QWEN_CODE_SUPPORTED_ENV_KEYS) {
    const secret = credentials[key];
    if (typeof secret === "string" && secret.trim().length > 0) {
      merged[key] = secret;
    }
  }
  return merged;
}

// src/commands/qwen-code.ts
async function runQwenCodeHub(opts) {
  while (true) {
    const config = readQwenCodeConfig();
    const health = checkHealth(config.binaryPath, config.env);
    const statusHint = health.status === "available" ? pc35.green("ready") : health.status === "degraded" ? pc35.yellow("degraded") : pc35.red("unavailable");
    const action = await p23.select({
      message: `Qwen Code CLI (${statusHint})`,
      options: [
        { value: "health", label: "Setup & Health", hint: "environment detection + install guidance" },
        { value: "prompt", label: "Prompt", hint: "single prompt run for quick tasks" },
        { value: "session", label: "Chat Session", hint: "full interactive terminal chat (qwen)" },
        { value: "configure", label: "Configure", hint: `model: ${config.defaultModel}, mode: ${config.approvalMode}` },
        ...opts?.allowBackToHub ? [{ value: "__back_to_hub", label: "\u2190 Back to harness type" }] : []
      ]
    });
    if (p23.isCancel(action) || action === "__back_to_hub")
      return "back";
    if (action === "health") {
      const env = detectEnvironment(config.binaryPath, config.env);
      const guidance = buildSetupGuidance(env);
      p23.note(guidance.join("\n"), "Qwen Code CLI \u2014 Setup Helper");
      continue;
    }
    if (action === "prompt") {
      if (health.status === "unavailable") {
        p23.note(health.summary, "Qwen Code CLI unavailable");
        continue;
      }
      const rawPrompt = await p23.text({
        message: "Enter prompt for Qwen Code",
        placeholder: "Describe what you want to build or analyze..."
      });
      if (p23.isCancel(rawPrompt))
        continue;
      const prompt = String(rawPrompt).trim();
      if (!prompt)
        continue;
      const runSpinner = p23.spinner();
      runSpinner.start(`Running qwen -p (model: ${config.defaultModel})...`);
      const result = await executeHeadlessPrompt(prompt, config);
      if (result.timedOut) {
        runSpinner.stop("Timed out.");
        p23.note(`Process timed out after ${config.timeoutMs}ms.`, "Execution timeout");
        continue;
      }
      if (result.exitCode !== 0) {
        runSpinner.stop(`Exited with code ${result.exitCode ?? "null"}.`);
        if (result.stderr.trim()) {
          p23.note(result.stderr.trim().slice(0, 2e3), "stderr");
        }
        continue;
      }
      runSpinner.stop(`Completed (${result.durationMs}ms).`);
      if (result.stdout.trim()) {
        console.log("");
        console.log(result.stdout.trim());
        console.log("");
      }
      continue;
    }
    if (action === "session") {
      if (health.status === "unavailable") {
        p23.note(health.summary, "Qwen Code CLI unavailable");
        continue;
      }
      p23.note(
        [
          `Binary: ${config.binaryPath}`,
          `Model: ${config.defaultModel}`,
          `Mode: ${config.approvalMode}`,
          "",
          "Launching interactive Qwen Code session...",
          "The Growthub CLI will resume when the session ends."
        ].join("\n"),
        "Qwen Code Interactive Session"
      );
      launchInteractiveSession(config);
      continue;
    }
    if (action === "configure") {
      await runConfigureFlow(config);
      continue;
    }
  }
}
async function runConfigureFlow(currentConfig) {
  const modelInput = await p23.text({
    message: "Default model",
    placeholder: "qwen3-coder",
    defaultValue: currentConfig.defaultModel
  });
  if (p23.isCancel(modelInput))
    return;
  const modeInput = await p23.select({
    message: "Approval mode",
    options: QWEN_CODE_APPROVAL_MODES.map((mode) => ({
      value: mode,
      label: mode,
      hint: mode === "default" ? "write tools need approval" : mode === "auto-edit" ? "file edits auto-approved" : "everything auto-approved"
    })),
    initialValue: currentConfig.approvalMode
  });
  if (p23.isCancel(modeInput))
    return;
  const binaryInput = await p23.text({
    message: "Binary path",
    placeholder: "qwen",
    defaultValue: currentConfig.binaryPath
  });
  if (p23.isCancel(binaryInput))
    return;
  const authAction = await p23.select({
    message: "Authentication setup",
    options: [
      {
        value: "skip",
        label: "Skip auth changes",
        hint: "Keep current key/OAuth setup"
      },
      {
        value: "set-key",
        label: "Set API key",
        hint: "Store provider API key in local secure harness storage"
      },
      {
        value: "clear-keys",
        label: "Clear stored API keys",
        hint: "Remove saved Qwen provider keys from local storage"
      }
    ],
    initialValue: "skip"
  });
  if (p23.isCancel(authAction))
    return;
  const nextEnv = { ...currentConfig.env };
  if (authAction === "set-key") {
    const providerKey = await p23.select({
      message: "Provider key variable",
      options: [
        ...QWEN_CODE_SUPPORTED_ENV_KEYS.map((key) => ({
          value: key,
          label: key,
          hint: `current: ${maskSecret(currentConfig.env[key])}`
        })),
        {
          value: "__back_to_auth_setup",
          label: "\u2190 Back to authentication setup"
        }
      ]
    });
    if (p23.isCancel(providerKey))
      return;
    if (providerKey === "__back_to_auth_setup")
      return;
    const keyValue = await p23.password({
      message: `${providerKey} value`,
      validate: (value) => {
        if (!value || String(value).trim().length === 0)
          return "Key value is required.";
      }
    });
    if (p23.isCancel(keyValue))
      return;
    nextEnv[providerKey] = String(keyValue).trim();
  } else if (authAction === "clear-keys") {
    for (const key of QWEN_CODE_SUPPORTED_ENV_KEYS) {
      delete nextEnv[key];
    }
  }
  const confirmed = await p23.confirm({
    message: `Save Qwen Code config? (model: ${String(modelInput)}, mode: ${modeInput}, binary: ${String(binaryInput)})`,
    initialValue: true
  });
  if (p23.isCancel(confirmed) || !confirmed)
    return;
  writeQwenCodeConfig({
    ...currentConfig,
    defaultModel: String(modelInput).trim() || currentConfig.defaultModel,
    approvalMode: modeInput,
    binaryPath: String(binaryInput).trim() || currentConfig.binaryPath,
    env: nextEnv
  });
  p23.log.success("Qwen Code config saved (including local auth storage updates).");
}
function registerQwenCodeCommands(program2) {
  const qwenCode = program2.command("qwen-code").description("Qwen Code CLI agent integration \u2014 health, prompt, interactive session");
  qwenCode.command("health").description("Check Qwen Code CLI environment and readiness").action(async () => {
    const config = readQwenCodeConfig();
    const health = checkHealth(config.binaryPath, config.env);
    const env = detectEnvironment(config.binaryPath, config.env);
    const guidance = buildSetupGuidance(env);
    console.log(`Status: ${health.status}`);
    console.log(health.summary);
    console.log("");
    for (const line of guidance) {
      console.log(line);
    }
  });
  qwenCode.command("prompt").description("Run a headless Qwen Code prompt and print the output").argument("<prompt>", "The prompt to send to Qwen Code").option("--model <model>", "Model override").option("--yolo", "Auto-approve all tool calls").option("--timeout-ms <ms>", "Execution timeout in milliseconds", (v) => Number(v)).option("--cwd <path>", "Working directory for the Qwen Code session").action(async (prompt, opts) => {
    const config = readQwenCodeConfig();
    const result = await executeHeadlessPrompt(prompt, {
      ...config,
      ...opts.model ? { defaultModel: opts.model } : {},
      ...opts.yolo ? { approvalMode: "yolo" } : {},
      ...opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {},
      ...opts.cwd ? { cwd: opts.cwd } : {}
    });
    if (result.timedOut) {
      console.error("Timed out.");
      process.exit(124);
    }
    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    process.exit(result.exitCode ?? 1);
  });
  qwenCode.command("session").description("Launch an interactive Qwen Code terminal session").option("--model <model>", "Model override").option("--yolo", "Auto-approve all tool calls").option("--cwd <path>", "Working directory for the Qwen Code session").action((opts) => {
    const config = readQwenCodeConfig();
    const { exitCode } = launchInteractiveSession({
      ...config,
      ...opts.model ? { defaultModel: opts.model } : {},
      ...opts.yolo ? { approvalMode: "yolo" } : {},
      ...opts.cwd ? { cwd: opts.cwd } : {}
    });
    process.exit(exitCode ?? 0);
  });
  qwenCode.action(async () => {
    await runQwenCodeHub({ allowBackToHub: false });
  });
}

// src/index.ts
init_banner();
init_home();
var program = new Command();
var DATA_DIR_OPTION_HELP = "Growthub data directory root (isolates local instance state)";
function resolveSurfaceProfile(config) {
  if (typeof config !== "object" || config === null)
    return null;
  const surface = config.surface;
  if (typeof surface !== "object" || surface === null)
    return null;
  const profile = surface.profile;
  return profile === "dx" || profile === "gtm" ? profile : null;
}
function resolveBootstrapOptions(argv) {
  const options = {};
  for (let index51 = 0; index51 < argv.length; index51 += 1) {
    const value = argv[index51];
    if ((value === "-c" || value === "--config") && argv[index51 + 1]) {
      options.config = argv[index51 + 1];
      index51 += 1;
      continue;
    }
    if ((value === "-d" || value === "--data-dir") && argv[index51 + 1]) {
      options.dataDir = argv[index51 + 1];
      index51 += 1;
    }
  }
  return options;
}
function registerSharedCommands(target) {
  target.command("onboard").description("Interactive first-run setup wizard").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("-y, --yes", "Accept defaults (quickstart + start immediately)", false).option("--run", "Start Growthub immediately after saving config", false).action(onboard);
  target.command("doctor").description("Run diagnostic checks on your Growthub setup").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("--repair", "Attempt to repair issues automatically").alias("--fix").option("-y, --yes", "Skip repair confirmation prompts").action(async (opts) => {
    await doctor(opts);
  });
  target.command("env").description("Print environment variables for deployment").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).action(envCommand);
  target.command("configure").description("Update configuration sections").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("-s, --section <section>", "Section to configure (llm, database, logging, server, storage, secrets)").action(configure);
  target.command("db:backup").description("Create a one-off database backup using current config").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("--dir <path>", "Backup output directory (overrides config)").option("--retention-days <days>", "Retention window used for pruning", (value) => Number(value)).option("--filename-prefix <prefix>", "Backup filename prefix", "growthub").option("--json", "Print backup metadata as JSON").action(async (opts) => {
    await dbBackupCommand(opts);
  });
  target.command("allowed-hostname").description("Allow a hostname for authenticated/private mode access").argument("<host>", "Hostname to allow (for example dotta-macbook-pro)").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).action(addAllowedHostname);
  target.command("run").description("Bootstrap local setup (onboard + doctor) and run Growthub").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("-i, --instance <id>", "Local instance id (default: default)").option("--repair", "Attempt automatic repairs during doctor", true).option("--no-repair", "Disable automatic repairs during doctor").action(runCommand);
  target.command("discover").description("Shared discovery entry for local app install, worker kits, and templates").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("--run", "Start Growthub immediately after saving config", false).action(async (opts) => {
    await runDiscoveryHub(opts);
  });
  registerKitCommands(target);
  registerTemplateCommands(target);
  registerCapabilityCommands(target);
  registerPipelineCommands(target);
  registerArtifactCommands(target);
  registerWorkflowCommands(target);
  registerOpenAgentsCommands(target);
  registerQwenCodeCommands(target);
  const auth = target.command("auth").description("Authentication and bootstrap utilities");
  auth.command("bootstrap-ceo").description("Create a one-time bootstrap invite URL for first instance admin").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("--force", "Create new invite even if admin already exists", false).option("--expires-hours <hours>", "Invite expiration window in hours", (value) => Number(value)).option("--base-url <url>", "Public base URL used to print invite link").action(bootstrapCeoInvite);
  auth.command("login").description("Sign in to hosted Growthub and save a CLI session (browser flow)").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("--base-url <url>", "Hosted Growthub base URL (defaults to auth.growthubBaseUrl or GROWTHUB_BASE_URL)").option("--token <token>", "Skip the browser flow by providing a pre-issued hosted token (scripting/CI)").option("--machine-label <label>", "Label identifying this machine in the hosted app").option("--workspace-label <label>", "Label identifying this workspace in the hosted app").option("--timeout-ms <ms>", "How long to wait for the browser callback", (value) => Number(value)).option("--no-browser", "Do not try to launch a browser \u2014 print the URL and wait").option("--json", "Output raw JSON").action(async (opts) => {
    await authLogin({
      ...opts,
      noBrowser: opts.browser === false
    });
  });
  auth.command("logout").description("Clear the hosted CLI session (local workspace profile is preserved)").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("--keep-overlay", "Keep cached hosted overlay metadata; only drop the session token").option("--json", "Output raw JSON").action(async (opts) => {
    await authLogout(opts);
  });
  auth.command("whoami").description("Print the authenticated hosted identity and linked local workspace").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("--json", "Output raw JSON").action(async (opts) => {
    await authWhoami(opts);
  });
  registerProfileCommands(target);
}
async function runHostedBridgeEntry(opts) {
  await authLogin({
    config: opts?.config,
    dataDir: opts?.dataDir
  });
}
async function runNativeIntelligenceHub() {
  while (true) {
    const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
    const currentConfig = readIntelligenceConfig();
    const recommendedModel = "gemma3:4b";
    const favoriteModel = currentConfig.localModel?.trim() || void 0;
    const defaultModel = currentConfig.localModel?.trim() || process.env.NATIVE_INTELLIGENCE_LOCAL_MODEL?.trim() || process.env.OLLAMA_MODEL?.trim() || recommendedModel;
    const status = await detectLocalIntelligenceStatus(baseUrl, defaultModel);
    const action = await p24.select({
      message: "Local Intelligence",
      options: [
        { value: "setup", label: "Setup helper", hint: "machine detection + install/env guidance" },
        { value: "models", label: "Manage local custom models", hint: "select active favorite/default model" },
        { value: "prompt", label: "Prompt local model (chat flow)", hint: "human first local prompt submissions" },
        { value: "flows", label: "Run native-intelligence with your prompt", hint: "planner/normalizer/recommender/summarizer" },
        { value: "__back_to_hub", label: "\u2190 Back to main menu" }
      ]
    });
    if (p24.isCancel(action) || action === "__back_to_hub")
      return "back";
    if (action === "setup") {
      const setupLines = [
        `OS: ${status.osLabel}`,
        `Ollama CLI: ${status.ollamaInstalled ? "detected" : "not detected"}`,
        `Ollama server: ${status.serverReachable ? "reachable" : "not reachable"} (${baseUrl})`,
        `Configured local model: ${defaultModel}`,
        `Model availability: ${status.modelAvailable ? "present" : "missing"}`,
        `Detected models: ${status.availableModels.length}`,
        "",
        ...buildSetupCommands(status.osLabel, baseUrl, recommendedModel)
      ];
      p24.note(setupLines.join("\n"), "Local Intelligence Setup Helper");
      continue;
    }
    if (action === "models") {
      const modelOptions = [
        ...prioritizeModelOptions(status.availableModels, favoriteModel, recommendedModel).map((modelId) => ({
          value: modelId,
          label: modelId === favoriteModel ? `\u2B50 ${modelId}` : modelId,
          hint: modelId === favoriteModel ? "favorite local model" : modelId === recommendedModel ? "recommended (validated locally)" : "detected local model"
        })),
        { value: "__custom_model", label: "Enter custom local model id", hint: "for any other local adapter model" },
        { value: "__back_to_local_intel", label: "\u2190 Back to Local Intelligence" }
      ];
      const adapterChoice = await p24.select({
        message: "Choose local custom model adapter",
        options: modelOptions
      });
      if (p24.isCancel(adapterChoice) || adapterChoice === "__back_to_local_intel")
        continue;
      const chosenModel = adapterChoice === "__custom_model" ? await promptForCustomModel(defaultModel) : adapterChoice;
      if (!chosenModel)
        continue;
      const applyConfirmed = await p24.confirm({
        message: `Apply Local Intelligence config for model "${chosenModel}"?`,
        initialValue: true
      });
      if (p24.isCancel(applyConfirmed) || !applyConfirmed)
        continue;
      const applySpinner = p24.spinner();
      applySpinner.start(`Applying model config (${chosenModel})...`);
      writeIntelligenceConfig({
        ...currentConfig,
        backendType: "local",
        modelId: inferCanonicalModelId(chosenModel),
        localModel: chosenModel,
        endpoint: `${baseUrl}/chat/completions`
      });
      const health = await checkBackendHealth(readIntelligenceConfig());
      if (!health.available) {
        applySpinner.stop(`Config saved, backend unavailable (${health.latencyMs}ms).`);
        p24.note(
          [...health.error ? [`Error: ${health.error}`] : [], "You can still run prompt flow and retry health later."].join("\n"),
          "Local model status"
        );
        continue;
      }
      applySpinner.stop(`Config saved and backend reachable (${health.latencyMs}ms).`);
      continue;
    }
    if (action === "prompt") {
      await runLocalPromptChat(baseUrl, defaultModel);
      continue;
    }
    const customPrompt = await p24.text({
      message: "Enter your local intelligence prompt",
      placeholder: "Describe what you want to create/analyze"
    });
    if (p24.isCancel(customPrompt))
      continue;
    const prompt = String(customPrompt).trim();
    if (!prompt) {
      p24.note("Prompt was empty. Nothing was run.", "Local Intelligence");
      continue;
    }
    await runNativeIntelligenceFlowSuite(baseUrl, defaultModel, prompt);
  }
}
async function detectLocalIntelligenceStatus(baseUrl, model) {
  const osLabel = process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux";
  const ollamaInstalled = spawnSync2("ollama", ["--version"], { stdio: "ignore" }).status === 0;
  const modelsUrl = `${baseUrl}/models`;
  try {
    const response = await fetch(modelsUrl, { method: "GET" });
    if (!response.ok) {
      return { osLabel, ollamaInstalled, serverReachable: false, modelAvailable: false, availableModels: [] };
    }
    const data = await response.json();
    const ids = (data.data ?? []).map((entry) => entry.id ?? "");
    return {
      osLabel,
      ollamaInstalled,
      serverReachable: true,
      modelAvailable: ids.includes(model),
      availableModels: ids.filter((id) => id.length > 0)
    };
  } catch {
    return { osLabel, ollamaInstalled, serverReachable: false, modelAvailable: false, availableModels: [] };
  }
}
function buildSetupCommands(osLabel, baseUrl, recommendedModel) {
  if (osLabel === "Windows") {
    return [
      "Quick setup (Windows):",
      "  1) Install Ollama from https://ollama.com/download/windows",
      "  2) Start Ollama app/service",
      `  3) Run: ollama pull ${recommendedModel}`,
      "  4) Optional env (PowerShell):",
      `     $env:OLLAMA_BASE_URL="${baseUrl}"`,
      '     $env:NATIVE_INTELLIGENCE_LOCAL_MODEL="<your-model-id>"'
    ];
  }
  return [
    "Quick setup (macOS/Linux):",
    "  1) brew install ollama",
    "  2) ollama serve &",
    `  3) ollama pull ${recommendedModel}`,
    `  4) export OLLAMA_BASE_URL=${baseUrl}`,
    "  5) export NATIVE_INTELLIGENCE_LOCAL_MODEL=<your-model-id>"
  ];
}
function prioritizeModelOptions(models, favoriteModel, recommendedModel) {
  const unique3 = [...new Set(models)];
  if (unique3.length === 0)
    return unique3;
  if (favoriteModel && unique3.includes(favoriteModel)) {
    return [favoriteModel, ...unique3.filter((id) => id !== favoriteModel)];
  }
  if (recommendedModel && unique3.includes(recommendedModel)) {
    return [recommendedModel, ...unique3.filter((id) => id !== recommendedModel)];
  }
  return unique3;
}
async function promptForCustomModel(defaultModel) {
  const input = await p24.text({
    message: "Enter local model id",
    placeholder: "example: gemma3:4b",
    defaultValue: defaultModel
  });
  if (p24.isCancel(input))
    return null;
  const trimmed = String(input).trim();
  return trimmed.length > 0 ? trimmed : null;
}
function inferCanonicalModelId(modelId) {
  const lower = modelId.toLowerCase();
  if (lower.includes("gemma3n"))
    return "gemma3n";
  if (lower.includes("codegemma"))
    return "codegemma";
  return "gemma3";
}
async function runLocalPromptChat(baseUrl, defaultModel) {
  const activeModel = defaultModel;
  const thread = loadOrCreateLocalThread();
  const baseConfig = {
    ...readIntelligenceConfig(),
    backendType: "local",
    modelId: inferCanonicalModelId(activeModel),
    localModel: activeModel,
    endpoint: `${baseUrl}/chat/completions`,
    // Local models can take 20-40s on first warmup.
    timeoutMs: Math.max(readIntelligenceConfig().timeoutMs ?? 3e4, 12e4)
  };
  const backend = createNativeIntelligenceBackend(baseConfig);
  p24.note(
    [
      `Active local model: ${activeModel}`,
      `Thread: ${thread.id}`,
      `Saved at: ${thread.filePath}`,
      "Type your prompt and press Enter.",
      "Use '/back' to return to Local Intelligence menu."
    ].join("\n"),
    "Local Prompt Flow"
  );
  while (true) {
    const rawPrompt = await p24.text({
      message: `Prompt (${activeModel})`,
      placeholder: "Ask anything..."
    });
    if (p24.isCancel(rawPrompt))
      return;
    const prompt = String(rawPrompt).trim();
    if (prompt === "/back")
      return;
    if (prompt.length === 0)
      continue;
    const historyContext = renderHistoryContext(thread.messages, 8);
    const runSpinner = p24.spinner();
    runSpinner.start("Invoking local model...");
    try {
      const out = await completeWithRetry(
        backend,
        baseConfig,
        {
          systemPrompt: "You are Growthub Local Intelligence. Be concise, direct, and useful.",
          userPrompt: historyContext.length > 0 ? `Conversation so far:
${historyContext}

User: ${prompt}` : prompt,
          responseFormat: "text"
        }
      );
      thread.messages.push({ role: "user", content: prompt, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      thread.messages.push({ role: "assistant", content: out.text, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      saveLocalThread(thread);
      runSpinner.stop(`Response received (${out.latencyMs}ms \xB7 ${out.modelId})`);
      console.log("");
      console.log(out.text);
      console.log("");
    } catch (err) {
      runSpinner.stop("Invocation failed.");
      p24.note(err instanceof Error ? err.message : String(err), "Local model error");
    }
  }
}
function resolveLocalThreadsDir() {
  return path35.resolve(resolvePaperclipHomeDir(), "native-intelligence", "threads");
}
function loadOrCreateLocalThread() {
  const dir = resolveLocalThreadsDir();
  fs27.mkdirSync(dir, { recursive: true });
  const activePath = path35.resolve(dir, "active-thread.json");
  if (fs27.existsSync(activePath)) {
    try {
      const parsed = JSON.parse(fs27.readFileSync(activePath, "utf-8"));
      const id2 = typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : `thread-${Date.now()}`;
      const threadFile = path35.resolve(dir, `${id2}.json`);
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      return { id: id2, filePath: threadFile, messages };
    } catch {
    }
  }
  const id = `thread-${Date.now()}`;
  const filePath = path35.resolve(dir, `${id}.json`);
  const thread = { id, filePath, messages: [] };
  saveLocalThread(thread);
  return thread;
}
function saveLocalThread(thread) {
  const dir = resolveLocalThreadsDir();
  fs27.mkdirSync(dir, { recursive: true });
  fs27.writeFileSync(
    thread.filePath,
    `${JSON.stringify({ id: thread.id, messages: thread.messages }, null, 2)}
`,
    "utf-8"
  );
  const activePath = path35.resolve(dir, "active-thread.json");
  fs27.writeFileSync(
    activePath,
    `${JSON.stringify({ id: thread.id, messages: thread.messages }, null, 2)}
`,
    "utf-8"
  );
}
function renderHistoryContext(messages, limit) {
  return messages.slice(-limit).map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`).join("\n");
}
async function completeWithRetry(backend, baseConfig, input) {
  try {
    return await backend.complete(input);
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    if (!message.includes("aborted"))
      throw err;
    const retryBackend = createNativeIntelligenceBackend({
      ...baseConfig,
      timeoutMs: Math.max(baseConfig.timeoutMs, 18e4)
    });
    return retryBackend.complete(input);
  }
}
async function runNativeIntelligenceFlowSuite(baseUrl, defaultModel, prompt) {
  const provider = createNativeIntelligenceProvider({
    backendType: "local",
    modelId: inferCanonicalModelId(defaultModel),
    localModel: defaultModel,
    endpoint: `${baseUrl}/chat/completions`
  });
  try {
    const contracts = await loadRuntimeContracts();
    if (contracts.length === 0) {
      throw new Error("No runtime contracts available for local-intelligence flow run.");
    }
    const savedWorkflows = await loadRuntimeWorkflows();
    const primaryContract = contracts.find((contract) => contract.inputs.length > 0) ?? contracts[0];
    const rawBindings = await collectBindingsFromContract(primaryContract, prompt);
    const requiredOutputTypes = primaryContract.outputTypes.length > 0 ? [primaryContract.outputTypes[0]] : void 0;
    const flowSpinner = p24.spinner();
    flowSpinner.start("Running planner/normalizer/recommender/summarizer with your prompt...");
    const plan = await provider.planWorkflow({
      userIntent: prompt,
      availableContracts: contracts,
      executionMode: "hosted",
      constraints: { maxNodes: 3, requiredOutputTypes }
    });
    const normalized = await provider.normalizeBindings({
      nodeSlug: primaryContract.slug,
      contract: primaryContract,
      rawBindings,
      executionMode: "hosted"
    });
    const recommendation = await provider.recommendWorkflow({
      userIntent: prompt,
      savedWorkflows,
      availableContracts: contracts,
      executionMode: "hosted"
    });
    const summaryNodes = plan.proposedNodes.length > 0 ? plan.proposedNodes.slice(0, 3).map((node) => {
      const contract = contracts.find((entry) => entry.slug === node.slug);
      return {
        slug: node.slug,
        bindingCount: 1,
        missingRequired: [],
        outputTypes: contract?.outputTypes ?? [],
        assetCount: 0
      };
    }) : [{
      slug: primaryContract.slug,
      bindingCount: Object.keys(rawBindings).length,
      missingRequired: normalized.missingRequired,
      outputTypes: primaryContract.outputTypes,
      assetCount: 0
    }];
    const summary = await provider.summarizeExecution({
      pipeline: {
        pipelineId: "local-intel-flow-suite",
        executionMode: "hosted",
        nodes: summaryNodes,
        warnings: []
      },
      registryContext: contracts,
      phase: "pre-execution"
    });
    flowSpinner.stop("Flow suite completed.");
    p24.note(
      [
        `Prompt: ${prompt}`,
        `Planner nodes: ${plan.proposedNodes.map((n) => n.slug).join(", ")}`,
        `Normalizer contract: ${primaryContract.slug} (${normalized.fields.length} field updates)`,
        `Recommender strategy: ${recommendation.topRecommendation.strategy}`,
        `Summarizer title: ${summary.title}`
      ].join("\n"),
      "Native Intelligence Flow Results"
    );
  } catch (err) {
    p24.note(err instanceof Error ? err.message : String(err), "Flow error");
  }
}
async function loadRuntimeContracts() {
  const registry = createCmsCapabilityRegistryClient();
  const { nodes } = await registry.listCapabilities({ enabledOnly: false });
  return nodes.map((node) => introspectNodeContract(node));
}
async function loadRuntimeWorkflows() {
  const session = readSession();
  if (!session || isSessionExpired(session))
    return [];
  const response = await listHostedWorkflows(session);
  if (!response?.workflows)
    return [];
  return response.workflows.map((workflow) => ({
    workflowId: workflow.workflowId,
    name: workflow.name,
    description: workflow.description ?? void 0,
    nodeCount: workflow.latestVersion?.nodeCount ?? 0,
    nodeSlugs: [],
    label: null,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt ?? void 0,
    versionCount: workflow.versionCount ?? 1
  }));
}
async function collectBindingsFromContract(contract, promptSeed) {
  const bindings = {};
  for (const input of contract.inputs) {
    const defaultValue = input.key === "prompt" ? promptSeed : input.defaultValue !== void 0 ? String(input.defaultValue) : "";
    const raw = await p24.text({
      message: `${contract.slug} \u2192 ${input.key} (${input.type}${input.required ? ", required" : ""})`,
      placeholder: input.required ? `Enter ${input.key}` : `Optional: press Enter to skip ${input.key}`,
      defaultValue
    });
    if (p24.isCancel(raw)) {
      throw new Error("Cancelled while collecting contract input bindings.");
    }
    const value = String(raw).trim();
    if (!value && input.required) {
      throw new Error(`Required binding "${input.key}" was left empty.`);
    }
    if (!value) {
      continue;
    }
    bindings[input.key] = value;
  }
  return bindings;
}
async function runDiscoveryHub(opts) {
  printPaperclipCliBanner();
  p24.intro("Growthub Local");
  while (true) {
    const workflowAccess = getWorkflowAccess();
    const surfaceChoice = await p24.select({
      message: "What do you want to do first?",
      options: [
        {
          value: "kits",
          label: "\u{1F9F0} Worker Kits",
          hint: "Self-contained workspace environments for agents"
        },
        {
          value: "templates",
          label: "\u{1F4DA} Templates",
          hint: "Artifact template library"
        },
        {
          value: "workflows",
          label: workflowAccess.state === "ready" ? "\u{1F517} Workflows" : "\u{1F517} Workflows" + pc36.dim(" (locked)"),
          hint: workflowAccess.state === "ready" ? "CMS contracts, dynamic pipelines, and saved workflows" : workflowAccess.reason
        },
        {
          value: "native-intelligence",
          label: "\u{1F9E0} Local Intelligence",
          hint: "use local custom models adapaters"
        },
        {
          value: "hosted-auth",
          label: "\u{1F510} Connect Growthub Account",
          hint: "Attach this CLI to the hosted Growthub user through the canonical browser flow"
        },
        {
          value: "agent-harness",
          label: "\u{1F916} Agent Harness",
          hint: "Paperclip Local App + Open Agents + Qwen Code"
        },
        {
          value: "help",
          label: "\u2753 Help CLI",
          hint: "See the main commands and what each path does"
        }
      ]
    });
    if (p24.isCancel(surfaceChoice)) {
      p24.cancel("Cancelled.");
      process.exit(0);
    }
    if (surfaceChoice === "help") {
      p24.note(
        [
          "\u{1F916} Agent Harness: filter by type \u2014 Paperclip Local App (GTM/DX profiles) or Open Agents (durable workflow orchestration).",
          "\u{1F9F0} Worker Kits: browse specialized agents and custom workspaces.",
          "\u{1F4DA} Templates: browse reusable artifact templates by library type.",
          "\u{1F517} Workflows: browse CMS contracts, create dynamic pipelines, and manage saved workflows.",
          "\u{1F9E0} Local Intelligence: use local custom models adapaters: inspect Gemma health, view intelligence tree, and run sample summary checks.",
          `   Locked state: ${workflowAccess.reason}.`,
          "\u{1F510} Connect Growthub Account: open the canonical hosted auth flow for this CLI.",
          "",
          "Direct commands:",
          "growthub auth login",
          "growthub auth whoami",
          "growthub kit",
          "growthub template",
          "growthub workflow",
          "growthub qwen-code",
          "growthub qwen-code health",
          'growthub qwen-code prompt "..."',
          "growthub capability list",
          "growthub pipeline assemble",
          "growthub artifact list",
          "growthub open-agents"
        ].join("\n"),
        "Growthub CLI Help"
      );
      continue;
    }
    if (surfaceChoice === "agent-harness") {
      while (true) {
        const harnessType = await p24.select({
          message: "Filter by type",
          options: [
            {
              value: "paperclip",
              label: "\u{1F4E6} Paperclip Local App",
              hint: "Create or load a GTM/DX profile on this machine"
            },
            {
              value: "open-agents",
              label: "\u{1F310} Open Agents",
              hint: "Durable workflow orchestration with prompt + chat session flow"
            },
            {
              value: "qwen-code",
              label: "\u{1F916} Qwen Code CLI",
              hint: "Open-source coding harness with prompt + interactive chat session"
            },
            {
              value: "__back_to_hub",
              label: "\u2190 Back to main menu"
            }
          ]
        });
        if (p24.isCancel(harnessType)) {
          p24.cancel("Cancelled.");
          process.exit(0);
        }
        if (harnessType === "__back_to_hub")
          break;
        if (harnessType === "paperclip") {
          let paperclipDone = false;
          while (!paperclipDone) {
            const appModeChoice = await p24.select({
              message: "How do you want to open Growthub Local?",
              options: [
                {
                  value: "create",
                  label: "\u{1F195} Create New Profile",
                  hint: "Build a new local app surface."
                },
                {
                  value: "load",
                  label: "\u{1F4C2} Load Existing Profile",
                  hint: "Work from a profile already on this machine."
                },
                {
                  value: "__back_to_harness",
                  label: "\u2190 Back to harness type"
                }
              ]
            });
            if (p24.isCancel(appModeChoice)) {
              p24.cancel("Cancelled.");
              process.exit(0);
            }
            if (appModeChoice === "__back_to_harness")
              break;
            if (appModeChoice === "load") {
              const existingSurfaces = listLocalSurfaces();
              if (existingSurfaces.length === 0) {
                p24.note("No existing local app profiles were found on this machine.", "Nothing found");
                continue;
              }
              const existingChoice = await p24.select({
                message: "Select an existing app surface",
                options: [
                  ...existingSurfaces.map((surface) => ({
                    value: surface.instanceId,
                    label: `${surface.profile === "gtm" ? "\u{1F4C8}" : "\u{1F9E0}"} ${surface.profile.toUpperCase()} \xB7 ${surface.instanceId}`,
                    hint: surface.configPath
                  })),
                  { value: "__back_to_app_mode", label: "\u2190 Back to app options" }
                ]
              });
              if (p24.isCancel(existingChoice)) {
                p24.cancel("Cancelled.");
                process.exit(0);
              }
              if (existingChoice === "__back_to_app_mode") {
                continue;
              }
              const selectedSurface = existingSurfaces.find((surface) => surface.instanceId === existingChoice);
              if (!selectedSurface) {
                p24.cancel("Selected profile not found.");
                process.exit(1);
              }
              process.env.PAPERCLIP_SURFACE_PROFILE = selectedSurface.profile;
              await runCommand({
                config: selectedSurface.configPath,
                instance: selectedSurface.instanceId,
                repair: true,
                yes: true
              });
              return;
            }
            const profileChoice = await p24.select({
              message: "Which new app surface do you want to create?",
              options: [
                {
                  value: "gtm",
                  label: "\u{1F4C8} GTM",
                  hint: "Go-to-Market surface."
                },
                {
                  value: "dx",
                  label: "\u{1F9E0} DX",
                  hint: "Developer Experience surface."
                },
                {
                  value: "__back_to_app_mode",
                  label: "\u2190 Back to app options"
                }
              ]
            });
            if (p24.isCancel(profileChoice)) {
              p24.cancel("Cancelled.");
              process.exit(0);
            }
            if (profileChoice === "__back_to_app_mode") {
              continue;
            }
            process.env.PAPERCLIP_SURFACE_PROFILE = profileChoice;
            await onboard({
              config: opts?.config,
              run: opts?.run ?? isInstallerMode(),
              yes: isInstallerMode()
            });
            return;
          }
          continue;
        }
        if (harnessType === "open-agents") {
          const oaResult = await runOpenAgentsHub({ allowBackToHub: true });
          if (oaResult === "back")
            continue;
          return;
        }
        if (harnessType === "qwen-code") {
          const qwenResult = await runQwenCodeHub({ allowBackToHub: true });
          if (qwenResult === "back")
            continue;
          return;
        }
      }
      continue;
    }
    if (surfaceChoice === "kits") {
      const result2 = await runInteractivePicker({ allowBackToHub: true });
      if (result2 === "back")
        continue;
      return;
    }
    if (surfaceChoice === "workflows") {
      const result2 = await runWorkflowPicker({ allowBackToHub: true });
      if (result2 === "back")
        continue;
      return;
    }
    if (surfaceChoice === "native-intelligence") {
      const result2 = await runNativeIntelligenceHub();
      if (result2 === "back")
        continue;
      return;
    }
    if (surfaceChoice === "hosted-auth") {
      await runHostedBridgeEntry({ config: opts?.config, dataDir: opts?.dataDir });
      continue;
    }
    const result = await runTemplatePicker({ allowBackToHub: true });
    if (result === "back")
      continue;
    return;
  }
}
function isInstallerMode() {
  return process.env.GROWTHUB_INSTALLER_MODE === "true";
}
function listLocalSurfaces() {
  const homeDir = resolvePaperclipHomeDir();
  const instancesDir = path35.resolve(homeDir, "instances");
  if (!fs27.existsSync(instancesDir))
    return [];
  return fs27.readdirSync(instancesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const instanceId = entry.name;
    const configPath = path35.resolve(instancesDir, instanceId, "config.json");
    if (!fs27.existsSync(configPath))
      return null;
    try {
      const config = readConfig(configPath);
      if (!config)
        return null;
      const profile = resolveSurfaceProfile(config);
      if (!profile)
        return null;
      return {
        instanceId,
        profile,
        configPath
      };
    } catch {
      return null;
    }
  }).filter((entry) => entry !== null).sort((left, right) => left.instanceId.localeCompare(right.instanceId));
}
function registerDxCommands(target) {
  const heartbeat = target.command("heartbeat").description("Heartbeat utilities");
  heartbeat.command("run").description("Run one agent heartbeat and stream live logs").requiredOption("-a, --agent-id <agentId>", "Agent ID to invoke").option("-c, --config <path>", "Path to config file").option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP).option("--context <path>", "Path to CLI context file").option("--profile <name>", "CLI context profile name").option("--api-base <url>", "Base URL for the Growthub server API").option("--api-key <token>", "Bearer token for agent-authenticated calls").option(
    "--source <source>",
    "Invocation source (timer | assignment | on_demand | automation)",
    "on_demand"
  ).option("--trigger <trigger>", "Trigger detail (manual | ping | callback | system)", "manual").option("--timeout-ms <ms>", "Max time to wait before giving up", "0").option("--json", "Output raw JSON where applicable").option("--debug", "Show raw adapter stdout/stderr JSON chunks").action(heartbeatRun);
  registerContextCommands(target);
  registerCompanyCommands(target);
  registerIssueCommands(target);
  registerAgentCommands(target);
  registerApprovalCommands(target);
  registerActivityCommands(target);
  registerDashboardCommands(target);
  registerWorktreeCommands(target);
  registerPluginCommands(target);
}
var bootstrapOptions = resolveBootstrapOptions(process.argv.slice(2));
applyDataDirOverride(bootstrapOptions, {
  hasConfigOption: bootstrapOptions.config !== void 0,
  hasContextOption: false
});
loadPaperclipEnvFile(bootstrapOptions.config);
var bootstrapConfig = readConfig(resolveConfigPath(bootstrapOptions.config));
var surfaceRuntime = initializeSurfaceRuntimeContract(resolveSurfaceProfile(bootstrapConfig) ?? void 0);
program.name("growthub").description("Growthub CLI \u2014 setup, configure, and run your local Growthub instance").version("0.3.60").addHelpText("after", `
Worker Kits (agent execution environments):

  Discovery:
    $ growthub kit                              Interactive browser \u2014 pick, preview, download
    $ growthub kit list                         All kits grouped by family (studio \xB7 workflow \xB7 operator \xB7 ops)
    $ growthub kit list --family studio         Filter by family
    $ growthub kit families                     Show family taxonomy with descriptions

  Download:
    $ growthub kit download                     Interactive (no arg = picker)
    $ growthub kit download higgsfield          Fuzzy slug \u2014 resolves automatically
    $ growthub kit download postiz              Postiz Social Media Studio
    $ growthub kit download zernio             Zernio Social Media Studio (Postiz UI Shell + Zernio Engine)
    $ growthub kit download higgsfield --yes    Skip confirmation (scripting / agent use)
    $ growthub kit download growthub-open-higgsfield-studio-v1 --out ~/kits

  Inspect & validate:
    $ growthub kit inspect higgsfield-studio-v1
    $ growthub kit inspect growthub-email-marketing-v1 --json
    $ growthub kit validate ./path/to/kit

  After download:
    1. Point Growthub local (or Claude Code) Working Directory at the exported folder
    2. cp .env.example .env  \u2192  add your API key
    3. Open a new session \u2014 the operator agent loads automatically

Instance setup:
    $ growthub onboard                          First-run interactive wizard
    $ growthub run                              Onboard + doctor + start server
    $ growthub doctor                           Diagnose and optionally repair
    $ growthub configure                        Update config sections
    $ growthub                                  Interactive discovery hub

Workflows (requires auth):
    $ growthub workflow                         Interactive workflow browser
    $ growthub workflow saved                   List saved workflow pipelines
    $ growthub pipeline assemble                Build and save hosted dynamic pipelines

Dynamic Registry Pipelines:

  Capabilities:
    $ growthub capability                       Interactive capability browser
    $ growthub capability list                  All capabilities grouped by family
    $ growthub capability list --family video   Filter by family
    $ growthub capability inspect video-gen     Inspect a specific capability
    $ growthub capability resolve               Resolve machine-scoped bindings

  Pipelines:
    $ growthub pipeline                         Interactive pipeline assembler
    $ growthub pipeline assemble                Interactive assembly
    $ growthub pipeline validate ./pipeline.json
    $ growthub pipeline execute ./pipeline.json

  Artifacts:
    $ growthub artifact list                    All pipeline artifacts
    $ growthub artifact list --type video       Filter by type
    $ growthub artifact inspect <id>            Inspect a specific artifact

Qwen Code CLI (agent harness):
    $ growthub qwen-code                        Interactive hub \u2014 health, prompt, session, configure
    $ growthub qwen-code health                 Check Qwen Code CLI environment and readiness
    $ growthub qwen-code prompt "fix the bug"   Headless single-prompt execution
    $ growthub qwen-code session                Launch interactive terminal session
    $ growthub qwen-code session --yolo         Auto-approve all tool calls

Hosted account bridge:
    $ growthub auth login                       Sign in via the hosted app (browser flow)
    $ growthub auth whoami                      Show signed-in identity + linked local workspace
    $ growthub auth logout                      Clear the hosted session (local workspace preserved)
`);
program.action(async () => {
  await runDiscoveryHub();
});
program.command("list").description("Open the interactive Growthub discovery hub").action(async () => {
  await runDiscoveryHub();
});
program.hook("preAction", (_thisCommand, actionCommand) => {
  const options = actionCommand.optsWithGlobals();
  const optionNames = new Set(actionCommand.options.map((option) => option.attributeName()));
  applyDataDirOverride(options, {
    hasConfigOption: optionNames.has("config"),
    hasContextOption: optionNames.has("context")
  });
  loadPaperclipEnvFile(options.config);
});
registerSharedCommands(program);
if (surfaceRuntime.capabilities.dxEnabled) {
  registerDxCommands(program);
} else {
  registerGtmCommands(program);
}
program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
