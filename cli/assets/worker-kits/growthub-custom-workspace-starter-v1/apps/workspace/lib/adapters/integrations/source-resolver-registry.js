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
 *   connectorKind?: string,          // http | mcp | chrome | tool | custom
 *   templateId?: string,
 *   capabilities?: string[],
 *   configSchema?: SchemaField[],
 *   referenceSchema?: Record<string, unknown>
 * }
 *
 * The route and the refresh button reference this registry only — they have
 * zero knowledge of Asana, Linear, HubSpot, or any other provider. Every
 * provider-specific fetch lives in its own resolver file and is completely
 * isolated from the others.
 */

// globalThis singleton so resolver files loaded via dynamic file:// import
// share the same Map instance as the Next.js-bundled copy of this module.
if (!globalThis.__growthubSourceResolverRegistry) {
  globalThis.__growthubSourceResolverRegistry = new Map();
}
const registry = globalThis.__growthubSourceResolverRegistry;

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

/**
 * Describe all registered resolvers — returns provider-agnostic metadata declared
 * by each resolver file. The UI uses this to render generic controls without any
 * knowledge of specific providers.
 *
 * Shape per entry:
 *   {
 *     integrationId: string,
 *     entityTypes:   string[],           // declared by the resolver
 *     hasListEntities: boolean,          // true if resolver.listEntities is a function
 *     configSchema: SchemaField[] | null // optional declarative params schema
 *     connectorKind, templateId, capabilities, referenceSchema — optional metadata
 *   }
 */
function describeRegisteredResolvers() {
  return Array.from(registry.entries()).map(([id, resolver]) => ({
    integrationId: id,
    entityTypes: Array.isArray(resolver.entityTypes) ? resolver.entityTypes : [],
    hasListEntities: typeof resolver.listEntities === "function",
    configSchema: Array.isArray(resolver.configSchema) ? resolver.configSchema : null,
    connectorKind: typeof resolver.connectorKind === "string" ? resolver.connectorKind : null,
    templateId: typeof resolver.templateId === "string" ? resolver.templateId : null,
    capabilities: Array.isArray(resolver.capabilities) ? resolver.capabilities : null,
    referenceSchema:
      resolver.referenceSchema && typeof resolver.referenceSchema === "object" && !Array.isArray(resolver.referenceSchema)
        ? resolver.referenceSchema
        : null
  }));
}

export { registerSourceResolver, getSourceResolver, listRegisteredResolvers, describeRegisteredResolvers };
