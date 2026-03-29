/**
 * `definePlugin` — the top-level helper for authoring a Paperclip plugin.
 *
 * Plugin authors call `definePlugin()` and export the result as the default
 * export from their worker entrypoint. The host imports the worker module,
 * calls `setup()` with a `PluginContext`, and from that point the plugin
 * responds to events, jobs, webhooks, and UI requests through the context.
 *
 * @see PLUGIN_SPEC.md §14.1 — Example SDK Shape
 *
 * @example
 * ```ts
 * // dist/worker.ts
 * import { definePlugin } from "@paperclipai/plugin-sdk";
 *
 * export default definePlugin({
 *   async setup(ctx) {
 *     ctx.logger.info("Linear sync plugin starting");
 *
 *     // Subscribe to events
 *     ctx.events.on("issue.created", async (event) => {
 *       const config = await ctx.config.get();
 *       await ctx.http.fetch(`https://api.linear.app/...`, {
 *         method: "POST",
 *         headers: { Authorization: `Bearer ${await ctx.secrets.resolve(config.apiKeyRef as string)}` },
 *         body: JSON.stringify({ title: event.payload.title }),
 *       });
 *     });
 *
 *     // Register a job handler
 *     ctx.jobs.register("full-sync", async (job) => {
 *       ctx.logger.info("Running full-sync job", { runId: job.runId });
 *       // ... sync logic
 *     });
 *
 *     // Register data for the UI
 *     ctx.data.register("sync-health", async ({ companyId }) => {
 *       const state = await ctx.state.get({
 *         scopeKind: "company",
 *         scopeId: String(companyId),
 *         stateKey: "last-sync",
 *       });
 *       return { lastSync: state };
 *     });
 *   },
 * });
 * ```
 */
// ---------------------------------------------------------------------------
// definePlugin — top-level factory
// ---------------------------------------------------------------------------
/**
 * Define a Paperclip plugin.
 *
 * Call this function in your worker entrypoint and export the result as the
 * default export. The host will import the module and call lifecycle methods
 * on the returned object.
 *
 * @param definition - Plugin lifecycle handlers
 * @returns A sealed `PaperclipPlugin` object for the host to consume
 *
 * @example
 * ```ts
 * import { definePlugin } from "@paperclipai/plugin-sdk";
 *
 * export default definePlugin({
 *   async setup(ctx) {
 *     ctx.logger.info("Plugin started");
 *     ctx.events.on("issue.created", async (event) => {
 *       // handle event
 *     });
 *   },
 *
 *   async onHealth() {
 *     return { status: "ok" };
 *   },
 * });
 * ```
 *
 * @see PLUGIN_SPEC.md §14.1 — Example SDK Shape
 */
export function definePlugin(definition) {
    return Object.freeze({ definition });
}
//# sourceMappingURL=define-plugin.js.map