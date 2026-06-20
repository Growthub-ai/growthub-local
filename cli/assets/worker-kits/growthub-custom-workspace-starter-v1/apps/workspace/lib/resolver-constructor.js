/**
 * Resolver Constructor V1 (CMS SDK v1.5.1) — closes the no-code "too many open
 * fields" gap. Instead of asking a non-technical user to hand-author a
 * resolver's rootPath / idField / entityType / auth header, this constructs the
 * governed resolver from facts ALREADY computed: the tested response profile
 * (`profileApiResponse`) and the resolver recommendation (`recommendResolver`),
 * plus the row's own auth config (mirrored from how test-api-record sent it, so
 * the resolver behaves exactly like the test that just passed).
 *
 * Agnostic across connector kinds via a single builder dispatch
 * (`getResolverBuilder`) — the Nango precedent generalized: custom-http
 * materializes a server file; nango is config-driven (no file); other kinds are
 * advertised truthfully as not-yet-supported rather than left blank.
 *
 * Pure: no fetch, no secrets, never throws. The returned `proposal` (file mode)
 * flows ONLY through the governed apply lane (helper/apply → writeResolverProposalFile)
 * and the no-code cockpit — never a hand edit.
 */

import { buildResolverProposal } from "./workspace-resolver-proposal.js";
import { slugifyIntegrationId, RESOLVER_ENDPOINT_BASE } from "./unified-resolver-registry.js";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

/** The canonical governed endpoint a row will be exposed at once registered. */
function endpointFor(integrationId) {
  const slug = slugifyIntegrationId(integrationId, "");
  return slug ? `${RESOLVER_ENDPOINT_BASE}/${slug}` : null;
}

/**
 * A plain-language "what the system detected" summary + a confidence band, so the
 * review panel can SHOW understanding ("I found 42 records under data.items…")
 * instead of a developer form. Pure; derived from the tested response profile.
 *   high   — top-level/clean records: direct apply is safe.
 *   medium — records nested under a container: review the mapping, then apply.
 *   low    — pagination or no record array: needs human review before trust.
 */
function detectShape(profile, recommendation) {
  if (!profile || !profile.parsed) return null;
  const level = clean(recommendation?.level);
  let confidence = "high";
  if (profile.hasPagination || !profile.usable) confidence = "low";
  else if (level === "recommended") confidence = "medium";
  else if (level === "required") confidence = "low";
  const recordPath = clean(profile.arrayPath);
  const entityType = clean(profile.suggestedEntityType) || "records";
  const idField = clean(profile.candidates?.id) || "id";
  return {
    confidence,
    recordCount: Number.isFinite(profile.recordCount) ? profile.recordCount : 0,
    recordPath,
    idField,
    entityType,
    hasPagination: Boolean(profile.hasPagination),
    // One human sentence the panel can show verbatim.
    sentence: profile.usable
      ? `Found ${profile.recordCount} ${entityType}${recordPath ? ` under "${recordPath}"` : " (top-level)"}, keyed by "${idField}"${profile.hasPagination ? " — paginated, so a resolver is required to fetch every page" : ""}.`
      : "No record array detected — review the response before activating.",
  };
}

/**
 * The auth header/prefix the resolver must send — mirrored from how
 * test-api-record built its request (authHeaderName || authHeader || x-api-key;
 * authPrefix), so a constructed resolver matches the test that just succeeded.
 */
function deriveAuthHeader(row) {
  const headerName = clean(row?.authHeaderName) || clean(row?.authHeader) || "x-api-key";
  const prefix = clean(row?.authPrefix);
  return { headerName, prefix };
}

function constructCustomHttpProposal({ row, profile, recommendation, recordRef }) {
  const { headerName, prefix } = deriveAuthHeader(row);
  const rootPath = clean(profile?.arrayPath) || clean(recommendation?.rootPath);
  const idField = clean(profile?.candidates?.id) || "id";
  const entityType = clean(profile?.suggestedEntityType) || clean(row?.entityTypes) || "records";

  const blanks = [];
  if (!clean(row?.integrationId)) blanks.push("integrationId");
  if (!clean(row?.baseUrl) && !clean(row?.endpoint)) blanks.push("target (baseUrl or endpoint)");

  const proposal = buildResolverProposal({
    integrationId: row?.integrationId,
    baseUrl: row?.baseUrl,
    endpoint: row?.endpoint,
    method: row?.method,
    authRef: row?.authRef,
    headerName,
    prefix,
    rootPath,
    idField,
    entityType,
    recordRef,
  });

  const detected = detectShape(profile, recommendation);
  // Respect the row's declared governance kind (http / custom / webhook / …);
  // default to http when unset. Only the resolver IMPLEMENTATION is HTTP here.
  const declaredKind = clean(row?.connectorKind).toLowerCase() || "http";
  return {
    ok: blanks.length === 0,
    mode: "file",
    connectorKind: declaredKind,
    endpoint: endpointFor(row?.integrationId),
    proposal,
    prefill: { rootPath, idField, entityType, headerName, prefix },
    detected,
    confidence: detected ? detected.confidence : "low",
    authRef: clean(row?.authRef),
    blanks,
    reason: blanks.length
      ? `Fill ${blanks.join(", ")} on the row before constructing a resolver.`
      : (recommendation?.reason || "Resolver constructed from the tested response shape."),
  };
}

/**
 * Honest readiness for a config-driven (Nango) row. A resolver registers from
 * the row automatically — but only if the row actually carries the minimum
 * binding. We never report "nothing to apply / done" when the endpoint would not
 * be usable; missing config returns an actionable next step instead.
 */
function constructNangoReadiness({ row }) {
  const blanks = [];
  const providerKey = clean(row?.providerConfigKey) || clean(row?.integrationId);
  if (!providerKey) blanks.push("providerConfigKey (or integrationId)");
  const hasConnection =
    clean(row?.connectionIds) || clean(row?.connectionId) || clean(row?.nangoConnectionId);
  if (!hasConnection) blanks.push("connectionIds");
  if (!clean(row?.endpoint)) blanks.push("endpoint (Nango proxy path)");
  const ready = blanks.length === 0;
  return {
    ok: ready,
    mode: "config-driven",
    connectorKind: "nango",
    endpoint: endpointFor(row?.integrationId),
    proposal: null,
    prefill: null,
    detected: null,
    blanks,
    state: ready ? "config-driven-ready" : "config-driven-missing-config",
    reason: ready
      ? "Config-driven via Nango — the resolver registers from this row automatically once it loads; no file to write. Confirm it appears as registered in the registry."
      : `Config-driven via Nango, but the row is missing ${blanks.join(", ")}. Add these so the resolver can register and the endpoint becomes usable.`,
    nextAction: ready ? null : { id: "edit", label: `Add ${blanks.join(", ")} to the row` },
  };
}

/**
 * Resolve a builder for a connector kind. Each builder emits the same
 * `{ ok, mode, connectorKind, proposal, prefill, blanks, reason }` contract.
 *   - custom-http (default) → file mode (materialized resolver)
 *   - nango                 → config-driven (no file; built from the row)
 *   - mcp/webhook/chrome    → not yet supported (truthful, not blank)
 */
function getResolverBuilder(connectorKind) {
  const kind = clean(connectorKind).toLowerCase();
  if (kind === "nango") {
    return (args) => constructNangoReadiness(args);
  }
  // Reserved for auto-construction — these need their own resolver implementation
  // and cannot be derived from an HTTP response shape (taxonomy: mcp|chrome|tool).
  if (["mcp", "chrome", "tool"].includes(kind)) {
    return (args) => ({
      ok: false,
      mode: "unsupported",
      reserved: true,
      connectorKind: kind,
      endpoint: endpointFor(args?.row?.integrationId),
      proposal: null,
      prefill: null,
      detected: null,
      blanks: [],
      // Reserved should build confidence, not feel like a dead end: say what is
      // reserved, what works now, and the concrete next move.
      reason: `Auto-construction for "${kind}" connectors is reserved for a future release. What works today: set this row's connector to custom-http and construct a resolver, or ask the governed helper to propose a plan. Your record stays governed either way.`,
      nextAction: { id: "use-custom-http", label: "Switch to a custom-http resolver" },
    });
  }
  return (args) => constructCustomHttpProposal(args);
}

/**
 * Construct a governed resolver for one API Registry row from its tested shape.
 *
 * @param {object} input
 * @param {object} input.row             the api-registry row (drawer draft)
 * @param {object} [input.profile]       profileApiResponse(row.lastResponse)
 * @param {object} [input.recommendation] recommendResolver(profile)
 * @param {object} [input.recordRef]     { objectId, rowName } of the governed record
 * @returns {{ ok, mode, connectorKind, proposal, prefill, blanks, reason }}
 */
function constructResolverProposal(input = {}) {
  const row = input.row && typeof input.row === "object" ? input.row : {};
  const builder = getResolverBuilder(row.connectorKind);
  return builder({
    row,
    profile: input.profile || null,
    recommendation: input.recommendation || null,
    recordRef: input.recordRef || null,
  });
}

export { constructResolverProposal, getResolverBuilder };
