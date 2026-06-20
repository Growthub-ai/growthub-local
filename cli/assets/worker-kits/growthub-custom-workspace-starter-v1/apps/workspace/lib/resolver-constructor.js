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

function clean(value) {
  return String(value == null ? "" : value).trim();
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

  return {
    ok: blanks.length === 0,
    mode: "file",
    connectorKind: "custom-http",
    proposal,
    prefill: { rootPath, idField, entityType, headerName, prefix },
    blanks,
    reason: blanks.length
      ? `Fill ${blanks.join(", ")} on the row before constructing a resolver.`
      : (recommendation?.reason || "Resolver constructed from the tested response shape."),
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
    return () => ({
      ok: true,
      mode: "config-driven",
      connectorKind: "nango",
      proposal: null,
      prefill: null,
      blanks: [],
      reason:
        "This API is config-driven via Nango — the resolver is built from the row automatically; no resolver file is needed.",
    });
  }
  if (["mcp", "webhook", "chrome"].includes(kind)) {
    return () => ({
      ok: false,
      mode: "unsupported",
      connectorKind: kind,
      proposal: null,
      prefill: null,
      blanks: [],
      reason: `Auto-construction for "${kind}" connectors is not available yet — wire it with a custom-http resolver or the helper.`,
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
