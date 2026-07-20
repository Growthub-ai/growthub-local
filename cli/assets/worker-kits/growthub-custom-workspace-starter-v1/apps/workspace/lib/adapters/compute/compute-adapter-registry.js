/**
 * Compute Provider Adapter Registry — provider-agnostic dispatch layer for
 * the Governed Compute Realization. Mirrors the sandbox adapter registry
 * philosophy exactly: one global Map, adapters register once at module load,
 * consumers reference the registry only and know nothing about any specific
 * provider.
 *
 * A compute provider adapter realizes the `ComputeProviderAdapter` contract
 * (`@growthub/api-contract/compute`). Adapters are the ONLY provider-specific
 * layer in the product: they map Capacity Profiles to their own catalog
 * INTERNALLY and normalize every provider response into contract shapes
 * (quotes, allocations, the 12 normalized compute events).
 *
 * Contract — every adapter must call `registerComputeProviderAdapter()` once
 * at module load with the shape:
 *
 *   {
 *     id:          string,      // stable adapter slug, e.g. "local-machine", "runpod-pods"
 *     label:       string,
 *     description: string,
 *     locality:    "local" | "remote" | "cluster",
 *     describeCapabilities(config) => ComputeProviderCapabilities  // static truth, no IO
 *     inspectCapacity(ctx)  => Promise<ComputeProviderQuote>       // observe only, never allocate
 *     allocate(ctx)         => Promise<ComputeAllocation>          // idempotency-honoring
 *     execute(ctx)          => Promise<ComputeEvent[]>             // submit exact ctx.workSpec
 *     status(ctx)           => Promise<ComputeEvent[]>
 *     resume(ctx, checkpoint) => Promise<ComputeEvent[]>           // fail closed when unsupported
 *     cancel(ctx)           => Promise<ComputeEvent[]>
 *     release(ctx)          => Promise<ComputeEvent[]>
 *   }
 *
 * ctx is a ComputeAdapterContext: { runRef, requirements, capacityProfileId,
 * idempotencyKeyHash, providerConfig, resolveEnv(name), fetchJson(url, init) }.
 * `resolveEnv` hands secret VALUES to the adapter at call time by env NAME —
 * secrets never live in rows, receipts, or adapter state, and adapters MUST
 * NOT log them, even on error paths.
 *
 * Adapters MUST NOT:
 *   - mutate growthub.config.json / source records (the execution seam owns
 *     persistence);
 *   - advance lifecycle without provider evidence (a normalized event always
 *     carries what the provider actually said);
 *   - leak provider-native fields into portable plans or receipts outside the
 *     adapterMeta of their own events;
 *   - promote, verify, or evaluate a model — those authorities live upstream.
 */

if (!globalThis.__growthubComputeAdapterRegistry) {
  globalThis.__growthubComputeAdapterRegistry = new Map();
}
const registry = globalThis.__growthubComputeAdapterRegistry;

const REQUIRED_METHODS = ["describeCapabilities", "inspectCapacity", "allocate", "execute", "status", "resume", "cancel", "release"];

function registerComputeProviderAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("registerComputeProviderAdapter: adapter must be a plain object");
  }
  if (typeof adapter.id !== "string" || !adapter.id.trim()) {
    throw new Error("registerComputeProviderAdapter: adapter.id must be a non-empty string");
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== "function") {
      throw new Error(`registerComputeProviderAdapter(${adapter.id}): adapter.${method} must be a function`);
    }
  }
  registry.set(adapter.id.trim(), adapter);
}

function getComputeProviderAdapter(id) {
  if (typeof id !== "string" || !id.trim()) return null;
  return registry.get(id.trim()) || null;
}

function listComputeProviderAdapters() {
  return Array.from(registry.keys());
}

function describeRegisteredComputeProviderAdapters() {
  return Array.from(registry.entries()).map(([id, adapter]) => ({
    id,
    label: typeof adapter.label === "string" ? adapter.label : id,
    description: typeof adapter.description === "string" ? adapter.description : "",
    locality: ["local", "remote", "cluster"].includes(adapter.locality) ? adapter.locality : "remote",
  }));
}

export {
  describeRegisteredComputeProviderAdapters,
  getComputeProviderAdapter,
  listComputeProviderAdapters,
  registerComputeProviderAdapter
};
