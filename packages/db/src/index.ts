import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type Db = ReturnType<typeof drizzle>;

export function createDb(connectionString: string): Db {
  const client = postgres(connectionString);
  return drizzle(client);
}

export async function ensurePostgresDatabase(
  adminConnectionString: string,
  dbName: string,
): Promise<"exists" | "created"> {
  const sql = postgres(adminConnectionString, { max: 1 });
  try {
    const rows = await sql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (rows.length > 0) return "exists";
    await sql.unsafe(`CREATE DATABASE "${dbName}"`);
    return "created";
  } finally {
    await sql.end();
  }
}

export async function getPostgresDataDirectory(connectionString: string): Promise<string> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const rows = await sql`SHOW data_directory`;
    return (rows[0] as any)?.data_directory ?? "";
  } finally {
    await sql.end();
  }
}

export async function inspectMigrations(
  connectionString: string,
): Promise<{ status: "upToDate" } | { status: "needsMigrations"; reason: string; pendingMigrations: string[]; tableCount?: number }> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const tables = await sql`SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema = 'public'`;
    const count = Number((tables[0] as any)?.cnt ?? 0);
    if (count === 0) {
      return { status: "needsMigrations", reason: "empty-database", pendingMigrations: ["init"] };
    }
    return { status: "upToDate" };
  } finally {
    await sql.end();
  }
}

export async function applyPendingMigrations(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "user" (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        email_verified BOOLEAN DEFAULT false,
        image TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        expires_at TIMESTAMPTZ,
        password TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        brand_color TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS company_memberships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        principal_type TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        membership_role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS instance_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT NOT NULL,
        value JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS instance_user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        adapter_type TEXT,
        model TEXT,
        icon TEXT,
        system_prompt TEXT,
        workspace_path TEXT,
        role TEXT DEFAULT 'executor',
        url_key TEXT,
        pause_reason TEXT,
        instructions_path TEXT,
        config JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        color TEXT,
        archived BOOLEAN DEFAULT false,
        url_key TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS issues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        project_id UUID,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT DEFAULT 'medium',
        identifier TEXT,
        assignee_agent_id UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        identifier TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        current_stage TEXT NOT NULL DEFAULT 'planning',
        stage_order JSONB NOT NULL DEFAULT '["planning","execution","review","qa","human"]',
        stage_definitions JSONB NOT NULL DEFAULT '[]',
        created_by_user_id TEXT,
        created_by_agent_id UUID,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        metadata JSONB DEFAULT '{}',
        instructions TEXT,
        lead_agent_id UUID
      );
      CREATE TABLE IF NOT EXISTS goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        level TEXT DEFAULT 'team',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        type TEXT NOT NULL DEFAULT 'generic',
        status TEXT NOT NULL DEFAULT 'pending',
        title TEXT,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS heartbeat_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS workspace_runtime_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID,
        service_type TEXT,
        status TEXT DEFAULT 'active',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS activity_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS agent_api_keys (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS agent_config_revisions (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS agent_runtime_state (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS agent_task_sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS agent_wakeup_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS approval_comments (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS assets (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS budget_incidents (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS budget_policies (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS company_logos (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS company_secrets (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS company_secret_versions (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS cost_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS document_revisions (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS execution_workspaces (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS finance_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS heartbeat_run_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS invites (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS issue_approvals (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS issue_attachments (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS issue_comments (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS issue_documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS issue_labels (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS issue_read_states (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS issue_work_products (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS join_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS labels (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS plugin_config (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS plugin_entities (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS plugin_job_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS plugin_jobs (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS plugin_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS plugins (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS plugin_state (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS plugin_webhook_deliveries (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS principal_permission_grants (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS project_goals (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS project_workspaces (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE IF NOT EXISTS workspace_operations (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
    `);
  } finally {
    await sql.end();
  }
}

export async function reconcilePendingMigrationHistory(
  _connectionString: string,
): Promise<{ repairedMigrations: string[] }> {
  return { repairedMigrations: [] };
}

export function formatDatabaseBackupResult(result: any): string {
  return `backup=${result?.backupFile ?? "unknown"}, size=${result?.sizeBytes ?? 0}`;
}

export async function runDatabaseBackup(_opts: any): Promise<any> {
  return { backupFile: "", sizeBytes: 0, prunedCount: 0 };
}

export async function runDatabaseRestore(_opts: any): Promise<any> {
  return {};
}

import { pgTable, uuid, text, timestamp, boolean as pgBoolean, integer, jsonb, index } from "drizzle-orm/pg-core";

export const authUsers = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  emailVerified: pgBoolean("email_verified").default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const authAccounts = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const authSessions = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const authVerifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export { companies } from "./schema/companies.js";

export const companyMemberships = pgTable("company_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  principalType: text("principal_type").notNull(),
  principalId: text("principal_id").notNull(),
  status: text("status").notNull().default("active"),
  membershipRole: text("membership_role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const instanceSettings = pgTable("instance_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  value: jsonb("value"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const instanceUserRoles = pgTable("instance_user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const activityLog: any = pgTable("activity_log", { id: uuid("id").primaryKey().defaultRandom() });
export const agentApiKeys: any = pgTable("agent_api_keys", { id: uuid("id").primaryKey().defaultRandom() });
export const agentConfigRevisions: any = pgTable("agent_config_revisions", { id: uuid("id").primaryKey().defaultRandom() });
export const agentRuntimeState: any = pgTable("agent_runtime_state", { id: uuid("id").primaryKey().defaultRandom() });
export const agentTaskSessions: any = pgTable("agent_task_sessions", { id: uuid("id").primaryKey().defaultRandom() });
export const agentWakeupRequests: any = pgTable("agent_wakeup_requests", { id: uuid("id").primaryKey().defaultRandom() });
export const approvalComments: any = pgTable("approval_comments", { id: uuid("id").primaryKey().defaultRandom() });
export const approvals: any = pgTable("approvals", { id: uuid("id").primaryKey().defaultRandom() });
export const assets: any = pgTable("assets", { id: uuid("id").primaryKey().defaultRandom() });
export const budgetIncidents: any = pgTable("budget_incidents", { id: uuid("id").primaryKey().defaultRandom() });
export const budgetPolicies: any = pgTable("budget_policies", { id: uuid("id").primaryKey().defaultRandom() });
export const companyLogos: any = pgTable("company_logos", { id: uuid("id").primaryKey().defaultRandom() });
export const companySecrets: any = pgTable("company_secrets", { id: uuid("id").primaryKey().defaultRandom() });
export const companySecretVersions: any = pgTable("company_secret_versions", { id: uuid("id").primaryKey().defaultRandom() });
export const costEvents: any = pgTable("cost_events", { id: uuid("id").primaryKey().defaultRandom() });
export const documentRevisions: any = pgTable("document_revisions", { id: uuid("id").primaryKey().defaultRandom() });
export const documents: any = pgTable("documents", { id: uuid("id").primaryKey().defaultRandom() });
export const executionWorkspaces: any = pgTable("execution_workspaces", { id: uuid("id").primaryKey().defaultRandom() });
export const financeEvents: any = pgTable("finance_events", { id: uuid("id").primaryKey().defaultRandom() });
export const goals: any = pgTable("goals", { id: uuid("id").primaryKey().defaultRandom() });
export const heartbeatRunEvents: any = pgTable("heartbeat_run_events", { id: uuid("id").primaryKey().defaultRandom() });
export const heartbeatRuns: any = pgTable("heartbeat_runs", { id: uuid("id").primaryKey().defaultRandom() });
export const invites: any = pgTable("invites", { id: uuid("id").primaryKey().defaultRandom() });
export const issueApprovals: any = pgTable("issue_approvals", { id: uuid("id").primaryKey().defaultRandom() });
export const issueAttachments: any = pgTable("issue_attachments", { id: uuid("id").primaryKey().defaultRandom() });
export const issueComments: any = pgTable("issue_comments", { id: uuid("id").primaryKey().defaultRandom() });
export const issueDocuments: any = pgTable("issue_documents", { id: uuid("id").primaryKey().defaultRandom() });
export const issueLabels: any = pgTable("issue_labels", { id: uuid("id").primaryKey().defaultRandom() });
export const issues: any = pgTable("issues", { id: uuid("id").primaryKey().defaultRandom() });
export const issueReadStates: any = pgTable("issue_read_states", { id: uuid("id").primaryKey().defaultRandom() });
export const issueWorkProducts: any = pgTable("issue_work_products", { id: uuid("id").primaryKey().defaultRandom() });
export const joinRequests: any = pgTable("join_requests", { id: uuid("id").primaryKey().defaultRandom() });
export const labels: any = pgTable("labels", { id: uuid("id").primaryKey().defaultRandom() });
export const pluginConfig: any = pgTable("plugin_config", { id: uuid("id").primaryKey().defaultRandom() });
export const pluginEntities: any = pgTable("plugin_entities", { id: uuid("id").primaryKey().defaultRandom() });
export const pluginJobRuns: any = pgTable("plugin_job_runs", { id: uuid("id").primaryKey().defaultRandom() });
export const pluginJobs: any = pgTable("plugin_jobs", { id: uuid("id").primaryKey().defaultRandom() });
export const pluginLogs: any = pgTable("plugin_logs", { id: uuid("id").primaryKey().defaultRandom() });
export const plugins: any = pgTable("plugins", { id: uuid("id").primaryKey().defaultRandom() });
export const pluginState: any = pgTable("plugin_state", { id: uuid("id").primaryKey().defaultRandom() });
export const pluginWebhookDeliveries: any = pgTable("plugin_webhook_deliveries", { id: uuid("id").primaryKey().defaultRandom() });
export const principalPermissionGrants: any = pgTable("principal_permission_grants", { id: uuid("id").primaryKey().defaultRandom() });
export const projectGoals: any = pgTable("project_goals", { id: uuid("id").primaryKey().defaultRandom() });
export const projects: any = pgTable("projects", { id: uuid("id").primaryKey().defaultRandom() });
export const projectWorkspaces: any = pgTable("project_workspaces", { id: uuid("id").primaryKey().defaultRandom() });
export { tickets } from "./schema/tickets.js";
export const workspaceOperations: any = pgTable("workspace_operations", { id: uuid("id").primaryKey().defaultRandom() });
export const workspaceRuntimeServices: any = pgTable("workspace_runtime_services", { id: uuid("id").primaryKey().defaultRandom() });
