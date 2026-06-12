/**
 * Sandbox Adapter Registry — execution-target-agnostic dispatch layer.
 *
 * The sandbox-environment governed Data Model object selects an adapter by id.
 * Each adapter is a thin, opinion-free execution target that takes a sealed
 * RunRequest and returns a RunResult. Adapters are dropped into
 * `lib/adapters/sandboxes/adapters/` and loaded by `adapter-loader.js`.
 *
 * Contract — every adapter must call `registerSandboxAdapter()` once at module
 * load with the following shape:
 *
 *   {
 *     id:           string,                              // stable adapter slug, e.g. "local-process", "fly-machines", "e2b"
 *     label:        string,                              // human-readable name for the drawer dropdown
 *     description:  string,                              // 1-line capability hint
 *     locality:     "local" | "serverless" | "remote",   // surfacing hint for the drawer
 *     supportedRuntimes: string[],                       // e.g. ["python", "node", "bash"]
 *     run: async (request, options?) => RunResult        // the execution function
 *   }
 *
 * RunRequest (sealed envelope passed to `run`):
 *   {
 *     runId:           string,            // stable id for the record
 *     name:            string,            // sandbox row name (display only)
 *     runtime:         string,            // KNOWN_SANDBOX_RUNTIMES member
 *     command:         string,            // bash script / entry script (server-resolved)
 *     timeoutMs:       number,            // hard cap, capped at SANDBOX_MAX_TIMEOUT_MS
 *     networkAllow:    boolean,           // allow outbound network from inside the sandbox
 *     allowList:       string[],          // hostnames the user explicitly allowed
 *     browserAccess:   boolean,           // row-level browser capability (implies networkAllow);
 *                                         // adapters surface it natively where the target supports
 *                                         // it and always publish GROWTHUB_SANDBOX_BROWSER_ACCESS
 *     env:             Record<string,string>, // server-resolved env (NEVER sent to browser)
 *     envRefSlugs:     string[],          // ref slugs resolved (kept for record metadata)
 *     envRefsMissing:  string[],          // slugs the server could not resolve (audit-only)
 *     workdir:         string,            // freshly-minted /tmp/growthub-sandbox-* path
 *     ranAt:           string             // ISO timestamp
 *   }
 *
 * RunResult (returned by `run`):
 *   {
 *     ok:        boolean,
 *     exitCode:  number | null,
 *     durationMs: number,
 *     stdout:    string,
 *     stderr:    string,
 *     error?:    string,
 *     adapterMeta?: Record<string, unknown>
 *   }
 *
 * Adapters MUST NOT:
 *   - read or persist files inside the workspace cwd; use the supplied workdir
 *   - log secret values, even on error paths
 *   - reach outside `request.env` for credential resolution
 *   - mutate `growthub.config.json` or `growthub.source-records.json` directly
 *     (the sandbox-run route handles versioned record persistence)
 *
 * The route and the data-model drawer reference this registry only — they have
 * zero knowledge of any specific execution target. This keeps the adapter
 * surface infinitely composable while preserving the governed integration
 * substrate (server-side credential boundary, sidecar persistence,
 * fork-sync-safe drop-zone extensibility).
 */

if (!globalThis.__growthubSandboxAdapterRegistry) {
  globalThis.__growthubSandboxAdapterRegistry = new Map();
}
const registry = globalThis.__growthubSandboxAdapterRegistry;

function registerSandboxAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("registerSandboxAdapter: adapter must be a plain object");
  }
  if (typeof adapter.id !== "string" || !adapter.id.trim()) {
    throw new Error("registerSandboxAdapter: adapter.id must be a non-empty string");
  }
  if (typeof adapter.run !== "function") {
    throw new Error(`registerSandboxAdapter(${adapter.id}): adapter.run must be a function`);
  }
  registry.set(adapter.id.trim(), adapter);
}

function getSandboxAdapter(id) {
  if (typeof id !== "string" || !id.trim()) return null;
  return registry.get(id.trim()) || null;
}

function listRegisteredSandboxAdapters() {
  return Array.from(registry.keys());
}

function describeRegisteredSandboxAdapters() {
  return Array.from(registry.entries()).map(([id, adapter]) => ({
    id,
    label: typeof adapter.label === "string" ? adapter.label : id,
    description: typeof adapter.description === "string" ? adapter.description : "",
    locality: ["local", "serverless", "remote"].includes(adapter.locality) ? adapter.locality : "local",
    supportedRuntimes: Array.isArray(adapter.supportedRuntimes) ? adapter.supportedRuntimes : [],
    supportedHosts: Array.isArray(adapter.supportedHosts) ? adapter.supportedHosts : null,
    hostCatalog: adapter.hostCatalog && typeof adapter.hostCatalog === "object"
      ? Object.entries(adapter.hostCatalog).map(([slug, host]) => ({
          slug,
          label: host?.label || slug,
          binary: host?.binary || null,
          installHint: host?.installHint || null,
          browserLane: host?.browser?.lane || "mcp-convention"
        }))
      : null
  }));
}

export {
  describeRegisteredSandboxAdapters,
  getSandboxAdapter,
  listRegisteredSandboxAdapters,
  registerSandboxAdapter
};
