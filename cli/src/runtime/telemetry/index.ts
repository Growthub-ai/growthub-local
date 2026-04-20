/**
 * Growthub Local thin PostHog activation-funnel telemetry.
 *
 * Public surface — see docs/POSTHOG_OBSERVABILITY.md for the canonical
 * event taxonomy, opt-out controls, and super admin linking steps.
 */

export {
  captureEvent,
  captureOutcome,
  sanitizeProperties,
  resolveTelemetryConfig,
  type CaptureInput,
  type TelemetryPropertyValue,
} from "./capture.js";
export {
  ensureAnonIdentity,
  readAnonIdentity,
  resetAnonIdentity,
  describeAnonIdentityPath,
  type AnonIdentity,
} from "./anon-id.js";
export { ALLOWED_PROPERTY_KEYS, type TelemetryEventName, type TelemetryOutcome } from "./events.js";
