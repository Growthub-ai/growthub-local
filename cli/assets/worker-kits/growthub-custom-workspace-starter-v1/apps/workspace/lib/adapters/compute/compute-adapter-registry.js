/**
 * Compute Provider Adapter Registry — provider-agnostic dispatch layer for
 * Governed Compute Realization.
 *
 * Remote and cluster adapters are wrapped at registration time so every HTTP
 * call crosses the single server-owned network policy. Direct adapter module
 * exports remain untouched for deterministic unit tests; the production route
 * obtains adapters only through this registry. Local adapters perform no remote
 * IO and retain object identity with their exported adapter.
 */

import { createGovernedComputeFetchJson } from "../../compute-network-policy.js";

if (!globalThis.__growthubComputeAdapterRegistry) {
  globalThis.__growthubComputeAdapterRegistry = new Map();
}
const registry = globalThis.__growthubComputeAdapterRegistry;

const REQUIRED_METHODS = ["describeCapabilities", "inspectCapacity", "allocate", "execute", "status", "resume", "cancel", "release"];
const CONTEXT_METHODS = ["inspectCapacity", "allocate", "execute", "status", "resume", "cancel", "release", "collectArtifact"];
const wrappedByOriginal = new WeakMap();

function contextWithGovernedOutboundPolicy(ctx) {
  const input = ctx && typeof ctx === "object" ? ctx : {};
  const fetchJson = createGovernedComputeFetchJson();
  return {
    ...input,
    // Caller-injected fetch functions are evidence-shaped test plumbing, not
    // a production network authority. Registered remote adapters always use
    // DNS pinning, explicit host policy, redirect refusal, and response bounds.
    fetchJson,
  };
}

function wrapRemoteAdapter(adapter) {
  if (adapter.locality === "local") return adapter;
  const existing = wrappedByOriginal.get(adapter);
  if (existing) return existing;
  const wrapped = { ...adapter };
  for (const method of CONTEXT_METHODS) {
    if (typeof adapter[method] !== "function") continue;
    wrapped[method] = function governedAdapterMethod(ctx, ...args) {
      return adapter[method].call(adapter, contextWithGovernedOutboundPolicy(ctx), ...args);
    };
  }
  wrappedByOriginal.set(adapter, wrapped);
  return wrapped;
}

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
  registry.set(adapter.id.trim(), wrapRemoteAdapter(adapter));
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
  registerComputeProviderAdapter,
};
