import assert from "node:assert/strict";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import { authorizeWorkspaceControlPlaneRequest } from "./workspace-control-plane-auth.js";

const issuer = "https://oidc.vercel.com/example-owner";
const owner = "example-owner";
const audience = `https://vercel.com/${owner}`;
const env = {
  GROWTHUB_CONTROL_PLANE_OIDC_ISSUER: issuer,
  GROWTHUB_CONTROL_PLANE_OIDC_AUDIENCE: audience,
  GROWTHUB_CONTROL_PLANE_OIDC_PROJECT_IDS: "prj_control_plane",
  GROWTHUB_CONTROL_PLANE_OIDC_OWNER_IDS: "team_control_plane",
  GROWTHUB_CONTROL_PLANE_OIDC_ENVIRONMENTS: "development,preview,production",
};

async function signedFixture(overrides = {}) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  const claims = {
    owner,
    project: "control-plane",
    project_id: "prj_control_plane",
    owner_id: "team_control_plane",
    environment: "production",
    ...overrides,
  };
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(`owner:${claims.owner}:project:${claims.project}:environment:${claims.environment}`)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(privateKey);
  const jwks = createLocalJWKSet({ keys: [publicJwk] });
  return { token, jwksForIssuer: () => jwks };
}

function request(path, token, method = "POST") {
  return new Request(`https://customer.example${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

test("accepts an exact signed control-plane identity on a governed action", async () => {
  const fixture = await signedFixture();
  const result = await authorizeWorkspaceControlPlaneRequest(
    request("/api/workspace/helper/apply", fixture.token),
    { env, jwksForIssuer: fixture.jwksForIssuer },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.identity, {
    issuer,
    audience,
    owner,
    project: "control-plane",
    projectId: "prj_control_plane",
    ownerId: "team_control_plane",
    environment: "production",
  });
});

test("rejects a signed identity outside the configured project allowlist", async () => {
  const fixture = await signedFixture({ project_id: "prj_other" });
  const result = await authorizeWorkspaceControlPlaneRequest(
    request("/api/workspace/helper/apply", fixture.token),
    { env, jwksForIssuer: fixture.jwksForIssuer },
  );
  assert.deepEqual(result, { ok: false, reason: "claims_not_trusted" });
});

test("rejects unrelated routes even when the token is valid", async () => {
  const fixture = await signedFixture();
  const result = await authorizeWorkspaceControlPlaneRequest(
    request("/api/admin", fixture.token),
    { env, jwksForIssuer: fixture.jwksForIssuer },
  );
  assert.deepEqual(result, { ok: false, reason: "action_not_governed" });
});

test("fails closed when the stable trust policy is incomplete", async () => {
  const fixture = await signedFixture();
  const result = await authorizeWorkspaceControlPlaneRequest(
    request("/api/workspace/helper/apply", fixture.token),
    {
      env: { ...env, GROWTHUB_CONTROL_PLANE_OIDC_PROJECT_IDS: "" },
      jwksForIssuer: fixture.jwksForIssuer,
    },
  );
  assert.deepEqual(result, { ok: false, reason: "trust_not_configured" });
});
