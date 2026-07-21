import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (name) => pathToFileURL(path.join(app, "lib", name)).href;
const { deriveComputeArtifactHonesty, normalizeComputeArtifactRef } = await import(lib("compute-evidence.js"));

const sha = "a".repeat(64);
const workSpecHash = "b".repeat(64);
const corpusSha256 = "c".repeat(64);
const lifecycle = { terminal: "completed" };

function artifact(overrides = {}) {
  return {
    runRef: {},
    kind: "gguf",
    locator: "/governed/model.gguf",
    sha256: sha,
    verifiedSha256: sha,
    sizeBytes: 1024,
    workSpecHash,
    corpusSha256,
    providerAttestationVerified: true,
    providerAttestationReason: "exact work spec and corpus",
    ...overrides,
  };
}

test("provider artifact cannot become promotable without exact work-spec and corpus attestation", () => {
  const absent = deriveComputeArtifactHonesty({ lifecycle, artifact: artifact({ providerAttestationVerified: false, providerAttestationReason: "missing corpus identity" }) });
  assert.equal(absent.promotable, false);
  assert.equal(absent.reasonCode, "artifact-provider-attestation-missing");
  assert.match(absent.reason, /missing corpus identity/);

  const verified = deriveComputeArtifactHonesty({ lifecycle, artifact: artifact() });
  assert.equal(verified.promotable, true);
});

test("artifact normalizer preserves provider attestation without inventing it", () => {
  const verified = normalizeComputeArtifactRef(artifact());
  assert.equal(verified.providerAttestationVerified, true);
  assert.equal(verified.workSpecHash, workSpecHash);
  assert.equal(verified.corpusSha256, corpusSha256);

  const callerShaped = normalizeComputeArtifactRef({ ...artifact(), providerAttestationVerified: "true" });
  assert.equal(callerShaped.providerAttestationVerified, false, "string-shaped truth never becomes verified evidence");
});
