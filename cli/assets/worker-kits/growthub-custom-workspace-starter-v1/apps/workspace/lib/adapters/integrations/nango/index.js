/**
 * Nango adapter barrel — server-side imports only.
 *
 * The browser must never import any module under this path. Routes consume
 * this barrel; UI components hit the routes.
 */

export {
  DEFAULT_NANGO_SECRET_ENV,
  describeNangoAdapter,
  executeAction,
  getStatus,
  listActions,
  projectNangoBinding,
  proxyRequest,
  resolveNangoEnv
} from "./nango-adapter.js";

export {
  buildNangoResolver,
  registerNangoResolversFromConfig
} from "./nango-config-loader.js";

export {
  validateActionExecuteRequest,
  validateActionsListInput,
  validateConnectionId,
  validateConnectionStatusRequest,
  validateHostUrl,
  validateNangoMode,
  validateProviderConfigKey,
  validateProxyRequest
} from "./nango-schema.js";
