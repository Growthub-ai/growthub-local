import type { PaperclipPluginManifestV1, PluginCapability, PluginEventType, Company, Project, Issue, IssueComment, Agent, Goal } from "@paperclipai/shared";
import type { PluginContext, PluginJobContext, PluginEvent, ScopeKey, ToolResult, ToolRunContext, AgentSessionEvent } from "./types.js";
export interface TestHarnessOptions {
    /** Plugin manifest used to seed capability checks and metadata. */
    manifest: PaperclipPluginManifestV1;
    /** Optional capability override. Defaults to `manifest.capabilities`. */
    capabilities?: PluginCapability[];
    /** Initial config returned by `ctx.config.get()`. */
    config?: Record<string, unknown>;
}
export interface TestHarnessLogEntry {
    level: "info" | "warn" | "error" | "debug";
    message: string;
    meta?: Record<string, unknown>;
}
export interface TestHarness {
    /** Fully-typed in-memory plugin context passed to `plugin.setup(ctx)`. */
    ctx: PluginContext;
    /** Seed host entities for `ctx.companies/projects/issues/agents/goals` reads. */
    seed(input: {
        companies?: Company[];
        projects?: Project[];
        issues?: Issue[];
        issueComments?: IssueComment[];
        agents?: Agent[];
        goals?: Goal[];
    }): void;
    setConfig(config: Record<string, unknown>): void;
    /** Dispatch a host or plugin event to registered handlers. */
    emit(eventType: PluginEventType | `plugin.${string}`, payload: unknown, base?: Partial<PluginEvent>): Promise<void>;
    /** Execute a previously-registered scheduled job handler. */
    runJob(jobKey: string, partial?: Partial<PluginJobContext>): Promise<void>;
    /** Invoke a `ctx.data.register(...)` handler by key. */
    getData<T = unknown>(key: string, params?: Record<string, unknown>): Promise<T>;
    /** Invoke a `ctx.actions.register(...)` handler by key. */
    performAction<T = unknown>(key: string, params?: Record<string, unknown>): Promise<T>;
    /** Execute a registered tool handler via `ctx.tools.execute(...)`. */
    executeTool<T = ToolResult>(name: string, params: unknown, runCtx?: Partial<ToolRunContext>): Promise<T>;
    /** Read raw in-memory state for assertions. */
    getState(input: ScopeKey): unknown;
    /** Simulate a streaming event arriving for an active session. */
    simulateSessionEvent(sessionId: string, event: Omit<AgentSessionEvent, "sessionId">): void;
    logs: TestHarnessLogEntry[];
    activity: Array<{
        message: string;
        entityType?: string;
        entityId?: string;
        metadata?: Record<string, unknown>;
    }>;
    metrics: Array<{
        name: string;
        value: number;
        tags?: Record<string, string>;
    }>;
}
/**
 * Create an in-memory host harness for plugin worker tests.
 *
 * The harness enforces declared capabilities and simulates host APIs, so tests
 * can validate plugin behavior without spinning up the Paperclip server runtime.
 */
export declare function createTestHarness(options: TestHarnessOptions): TestHarness;
//# sourceMappingURL=testing.d.ts.map