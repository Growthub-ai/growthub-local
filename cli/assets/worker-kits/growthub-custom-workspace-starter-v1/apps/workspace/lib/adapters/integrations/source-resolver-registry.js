/**
 * Source Resolver Registry — provider-agnostic dispatch layer.
 *
 * Contract:
 *   Each integration ships its own resolver file under
 *   `lib/adapters/integrations/resolvers/<id>.js` and calls
 *   `registerSourceResolver` once at module load time.
 *
 * Resolver shape:
 * {
 *   integrationId: string,           // stable provider slug, e.g. "asana"
 *   entityTypes: string[],           // e.g. ["project.tasks", "workspace.users"]
 *   listEntities: async (config, connection) => NormalizedEntity[],
 *   fetchRecords: async (config, connection, binding) => Record[]
 * }
 *
 * The route and the refresh button reference this registry only — they have
 * zero knowledge of Asana, Linear, HubSpot, or any other provider. Every
 * provider-specific fetch lives in its own resolver file and is completely
 * isolated from the others.
 */

const registry = new Map();

/**
 * Register a source resolver. Called once per provider at module load.
 * Calling again with the same integrationId replaces the existing resolver.
 */
function registerSourceResolver(resolver) {
  if (!resolver || typeof resolver !== "object") {
    throw new Error("registerSourceResolver: resolver must be a plain object");
  }
  if (typeof resolver.integrationId !== "string" || !resolver.integrationId.trim()) {
    throw new Error("registerSourceResolver: resolver.integrationId must be a non-empty string");
  }
  if (typeof resolver.fetchRecords !== "function") {
    throw new Error(`registerSourceResolver(${resolver.integrationId}): resolver.fetchRecords must be a function`);
  }
  registry.set(resolver.integrationId.trim(), resolver);
}

/**
 * Look up a registered resolver by integration id.
 * Returns null when no resolver has been registered for that id.
 */
function getSourceResolver(integrationId) {
  if (typeof integrationId !== "string" || !integrationId.trim()) return null;
  return registry.get(integrationId.trim()) || null;
}

/**
 * List all registered integration ids. Useful for diagnostics.
 */
function listRegisteredResolvers() {
  return Array.from(registry.keys());
}

export { registerSourceResolver, getSourceResolver, listRegisteredResolvers };
