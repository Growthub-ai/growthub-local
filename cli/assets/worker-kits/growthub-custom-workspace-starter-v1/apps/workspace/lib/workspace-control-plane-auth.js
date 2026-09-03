import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";

const GOVERNED_ACTIONS = new Set([
  "GET /api/workspace",
  "GET /api/workspace/sandbox-run",
  "POST /api/workspace/helper/apply",
  "POST /api/workspace/sandbox-run",
  "POST /api/workspace/workflow/publish",
]);

const jwksByIssuer = new Map();

function value(input, max = 500) {
  return typeof input === "string" && input.trim() && input.trim().length <= max
    ? input.trim()
    : null;
}

function csv(input) {
  return new Set(
    String(input || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function bearer(input) {
  const match = /^Bearer\s+(\S+)$/i.exec(value(input, 16_384) || "");
  return match?.[1] || null;
}

function actionFor(request) {
  const url = new URL(request.url);
  const pathname = url.pathname.length > 1
    ? url.pathname.replace(/\/+$/, "")
    : url.pathname;
  return `${request.method.toUpperCase()} ${pathname}`;
}

function canonicalVercelIdentity(payload) {
  const issuer = value(payload.iss, 2_048)?.replace(/\/+$/, "") || null;
  const owner = value(payload.owner);
  const project = value(payload.project);
  const projectId = value(payload.project_id);
  const ownerId = value(payload.owner_id);
  const environment = value(payload.environment);
  const audience = value(payload.aud, 2_048);
  if (!issuer || !owner || !project || !projectId || !ownerId || !environment || !audience) {
    return null;
  }
  let issuerUrl;
  try {
    issuerUrl = new URL(issuer);
  } catch {
    return null;
  }
  if (
    issuerUrl.protocol !== "https:" ||
    issuerUrl.hostname !== "oidc.vercel.com" ||
    audience !== `https://vercel.com/${owner}` ||
    value(payload.sub, 2_048) !== `owner:${owner}:project:${project}:environment:${environment}`
  ) {
    return null;
  }
  return { issuer, audience, owner, project, projectId, ownerId, environment };
}

function trustPolicy(env) {
  const issuer = value(env.GROWTHUB_CONTROL_PLANE_OIDC_ISSUER, 2_048)?.replace(/\/+$/, "") || null;
  const audience = value(env.GROWTHUB_CONTROL_PLANE_OIDC_AUDIENCE, 2_048);
  const projectIds = csv(env.GROWTHUB_CONTROL_PLANE_OIDC_PROJECT_IDS);
  const ownerIds = csv(env.GROWTHUB_CONTROL_PLANE_OIDC_OWNER_IDS);
  const environments = csv(env.GROWTHUB_CONTROL_PLANE_OIDC_ENVIRONMENTS);
  if (!issuer || !audience || !projectIds.size || !ownerIds.size || !environments.size) return null;
  return { issuer, audience, projectIds, ownerIds, environments };
}

function remoteJwks(issuer) {
  if (!jwksByIssuer.has(issuer)) {
    jwksByIssuer.set(issuer, createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`)));
  }
  return jwksByIssuer.get(issuer);
}

export async function authorizeWorkspaceControlPlaneRequest(
  request,
  { env = process.env, jwksForIssuer = remoteJwks } = {},
) {
  if (!GOVERNED_ACTIONS.has(actionFor(request))) {
    return { ok: false, reason: "action_not_governed" };
  }
  const token = bearer(request.headers.get("authorization"));
  if (!token) return { ok: false, reason: "bearer_missing" };

  const trust = trustPolicy(env);
  if (!trust) return { ok: false, reason: "trust_not_configured" };

  let hinted;
  try {
    hinted = canonicalVercelIdentity(decodeJwt(token));
  } catch {
    return { ok: false, reason: "token_invalid" };
  }
  if (
    !hinted ||
    hinted.issuer !== trust.issuer ||
    hinted.audience !== trust.audience ||
    !trust.projectIds.has(hinted.projectId) ||
    !trust.ownerIds.has(hinted.ownerId) ||
    !trust.environments.has(hinted.environment)
  ) {
    return { ok: false, reason: "claims_not_trusted" };
  }

  try {
    const { payload } = await jwtVerify(token, jwksForIssuer(hinted.issuer), {
      issuer: trust.issuer,
      audience: trust.audience,
      algorithms: ["RS256"],
    });
    const verified = canonicalVercelIdentity(payload);
    if (
      !verified ||
      verified.projectId !== hinted.projectId ||
      verified.ownerId !== hinted.ownerId ||
      verified.environment !== hinted.environment
    ) {
      return { ok: false, reason: "claims_not_trusted" };
    }
    return { ok: true, identity: verified };
  } catch {
    return { ok: false, reason: "token_invalid" };
  }
}
