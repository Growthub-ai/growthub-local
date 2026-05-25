/**
 * Nango config-driven resolver registration.
 *
 * Scans `dataModel.objects[]` for `objectType: "api-registry"` rows with
 * `connectorKind: "nango"` and registers a source resolver for each one.
 * The resolver key is the row's `integrationId`, matching the rest of the
 * resolver registry contract — `getSourceResolver(integrationId)` returns
 * a resolver that fans out via Nango Proxy.
 *
 * Invariants:
 *   - No file authoring is required. Operators add api-registry rows; the
 *     loader picks them up at the next route invocation.
 *   - The Nango secret is resolved from env at proxy time, never read here.
 *   - This loader is idempotent: re-registration with the same integrationId
 *     replaces the previous resolver (matching the existing registry behavior).
 *
 * This module is server-only. Browser code must not import it.
 */

import { registerSourceResolver } from "../source-resolver-registry.js";
import {
  executeAction as nangoExecuteAction,
  projectNangoBinding,
  proxyRequest as nangoProxyRequest
} from "./nango-adapter.js";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickArray(value) {
  return Array.isArray(value)
    ? value.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim())
    : typeof value === "string"
      ? value.split(",").map((v) => v.trim()).filter(Boolean)
      : [];
}

/**
 * Build the resolver object for a single Nango-backed api-registry row.
 *
 * The resolver:
 *   - fetchRecords(binding) — proxies one request per connectionId; records
 *     are flattened (with `_nangoConnectionId` stamped) and returned. The
 *     binding can override `endpoint`, `method`, `params`, and `data`.
 *   - listEntities() — returns the configured connection IDs as
 *     NormalizedIntegrationEntity records so the no-code reference UI can
 *     pick one to bind against.
 *   - runAction(actionName, input) — runs a Nango action function for the
 *     binding's `connectionId` (or the first one when the binding omits it).
 */
function buildNangoResolver(row) {
  const binding = projectNangoBinding(row);
  if (!binding) return null;
  const integrationId = binding.integrationId || binding.providerConfigKey;
  if (!integrationId) return null;

  async function fetchRecords(_config, _connection, callBinding = {}) {
    const connectionIds = Array.isArray(callBinding?.connectionIds) && callBinding.connectionIds.length
      ? pickArray(callBinding.connectionIds)
      : binding.connectionIds;
    const targets = connectionIds.length
      ? connectionIds
      : (typeof callBinding?.connectionId === "string" && callBinding.connectionId.trim()
        ? [callBinding.connectionId.trim()]
        : []);
    if (!targets.length) {
      const error = new Error("No Nango connectionId provided. Set connectionIds on the api-registry row, or pass connectionId in the binding.");
      error.code = "NANGO_NO_CONNECTION";
      throw error;
    }
    const endpoint = (callBinding?.endpoint || binding.endpoint || "").trim();
    if (!endpoint) {
      const error = new Error("No Nango proxy endpoint configured. Set endpoint on the api-registry row, or pass endpoint in the binding.");
      error.code = "NANGO_NO_ENDPOINT";
      throw error;
    }
    const method = String(callBinding?.method || binding.method || "GET").toUpperCase();
    const params = isPlainObject(callBinding?.params) ? callBinding.params : undefined;
    const data = callBinding?.data;
    const aggregated = [];
    for (const connectionId of targets) {
      const result = await nangoProxyRequest({
        providerConfigKey: binding.providerConfigKey,
        connectionId,
        method,
        endpoint,
        params,
        data,
        secretEnvName: binding.secretEnvName
      });
      const payload = result?.data;
      if (Array.isArray(payload)) {
        for (const record of payload) {
          aggregated.push(isPlainObject(record)
            ? { ...record, _nangoConnectionId: connectionId }
            : { value: record, _nangoConnectionId: connectionId });
        }
      } else if (isPlainObject(payload)) {
        for (const key of ["records", "results", "data", "items", "rows"]) {
          if (Array.isArray(payload[key])) {
            for (const record of payload[key]) {
              aggregated.push(isPlainObject(record)
                ? { ...record, _nangoConnectionId: connectionId }
                : { value: record, _nangoConnectionId: connectionId });
            }
            break;
          }
        }
        if (aggregated.length === 0) {
          aggregated.push({ ...payload, _nangoConnectionId: connectionId });
        }
      }
    }
    return aggregated;
  }

  async function listEntities(_config, _connection) {
    return binding.connectionIds.map((connectionId) => ({
      id: connectionId,
      label: connectionId,
      secondaryLabel: binding.providerConfigKey,
      entityType: "nango.connection",
      provider: integrationId,
      lane: "workspace-integration",
      status: "configured",
      metadata: {
        providerConfigKey: binding.providerConfigKey,
        environment: binding.environment || null
      }
    }));
  }

  async function runAction(_config, _connection, callBinding = {}) {
    const actionName = String(callBinding?.action || "").trim();
    if (!actionName) {
      const error = new Error("action name is required");
      error.code = "NANGO_NO_ACTION";
      throw error;
    }
    if (binding.enabledActions.length && !binding.enabledActions.includes(actionName)) {
      const error = new Error(`action "${actionName}" is not in the api-registry row's enabledActions allowlist`);
      error.code = "NANGO_ACTION_NOT_ALLOWED";
      throw error;
    }
    const connectionId = String(callBinding?.connectionId || binding.connectionIds[0] || "").trim();
    if (!connectionId) {
      const error = new Error("No Nango connectionId provided for the action.");
      error.code = "NANGO_NO_CONNECTION";
      throw error;
    }
    return nangoExecuteAction({
      providerConfigKey: binding.providerConfigKey,
      connectionId,
      action: actionName,
      input: callBinding?.input,
      secretEnvName: binding.secretEnvName
    });
  }

  return {
    integrationId,
    entityTypes: ["nango.connection"],
    connectorKind: "nango",
    templateId: "nango",
    capabilities: binding.enabledActions.length ? ["listEntities", "fetchRecords", "runAction"] : ["listEntities", "fetchRecords"],
    referenceSchema: {
      valueField: "id",
      labelField: "label",
      secondaryLabelField: "secondaryLabel"
    },
    listEntities,
    fetchRecords,
    runAction
  };
}

/**
 * Register a Nango source resolver for every api-registry row in the given
 * workspace config that declares `connectorKind: "nango"`. Returns the list
 * of integrationIds registered (useful for diagnostics).
 */
function registerNangoResolversFromConfig(workspaceConfig) {
  if (!isPlainObject(workspaceConfig)) return [];
  const objects = workspaceConfig?.dataModel?.objects;
  if (!Array.isArray(objects)) return [];
  const registered = [];
  for (const object of objects) {
    if (!isPlainObject(object) || object.objectType !== "api-registry") continue;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    for (const row of rows) {
      if (!isPlainObject(row) || row.connectorKind !== "nango") continue;
      const resolver = buildNangoResolver(row);
      if (!resolver) continue;
      registerSourceResolver(resolver);
      registered.push(resolver.integrationId);
    }
  }
  return registered;
}

export { buildNangoResolver, registerNangoResolversFromConfig };
