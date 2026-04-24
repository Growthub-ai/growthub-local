/**
 * Agency Portal Starter Kit — registration and primitive contract tests.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BUNDLED_KIT_CATALOG } from "../kits/catalog.js";
import {
  inspectBundledKit,
  listBundledKits,
  validateBundledKitAssetRoot,
} from "../kits/service.js";

const KIT_ID = "growthub-agency-portal-starter-v1";
const WORKER_ID = "agency-portal-operator";
const BRIEF_TYPE = "agency-portal-workspace";

const KIT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  `../../assets/worker-kits/${KIT_ID}`,
);

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(KIT_ROOT, relativePath), "utf8");
}

describe("growthub-agency-portal-starter-v1 — catalog registration", () => {
  it("is registered as a studio worker kit", () => {
    const entry = BUNDLED_KIT_CATALOG.find((kit) => kit.id === KIT_ID);
    expect(entry).toMatchObject({
      id: KIT_ID,
      packageDirName: KIT_ID,
      defaultBundleId: KIT_ID,
      type: "worker",
      executionMode: "export",
      activationModes: ["export"],
      family: "studio",
    });
  });

  it("is surfaced by listBundledKits with the expected brief type", () => {
    const kit = listBundledKits().find((item) => item.id === KIT_ID);
    expect(kit).toMatchObject({
      bundleId: KIT_ID,
      briefType: BRIEF_TYPE,
      type: "worker",
      executionMode: "export",
      activationModes: ["export"],
    });
  });

  it("inspects with local shell and Vercel app payload paths", () => {
    const info = inspectBundledKit(KIT_ID);
    expect(info.family).toBe("studio");
    expect(info.requiredPaths).toContain("studio");
    expect(info.requiredPaths).toContain("apps/agency-portal");
    expect(info.requiredPaths).toContain("apps/agency-portal/lib/adapters");
    expect(info.requiredPaths).toContain(`bundles/${KIT_ID}.json`);
  });

  it("passes bundled asset validation", () => {
    expect(() =>
      validateBundledKitAssetRoot(KIT_ROOT, { kitId: KIT_ID }),
    ).not.toThrow();
  });
});

describe("growthub-agency-portal-starter-v1 — manifests and primitives", () => {
  it("kit.json declares the workspace primitives, Vite shell, and Vercel app", () => {
    const manifest = JSON.parse(readText("kit.json"));
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.kit.id).toBe(KIT_ID);
    expect(manifest.entrypoint.workerId).toBe(WORKER_ID);
    expect(manifest.frozenAssetPaths).toEqual(
      expect.arrayContaining([
        "SKILL.md",
        "templates/project.md",
        "templates/self-eval.md",
        "templates/portal-brief.md",
        "templates/deployment-handoff.md",
        "examples/portal-brief-sample.md",
        "helpers/README.md",
        "skills/README.md",
        "studio/package.json",
        "studio/package-lock.json",
        "apps/agency-portal/package.json",
        "apps/agency-portal/package-lock.json",
        "apps/agency-portal/next.config.js",
        "apps/agency-portal/app/settings/integrations/page.jsx",
        "apps/agency-portal/lib/adapters/env.js",
        "apps/agency-portal/lib/adapters/integrations/index.js",
        "apps/agency-portal/lib/adapters/integrations/growthub-connection-normalizer.js",
        "apps/agency-portal/lib/domain/integrations.js",
        "docs/adapter-contracts.md",
      ]),
    );
  });

  it("bundle manifest matches kit.json", () => {
    const bundle = JSON.parse(readText(`bundles/${KIT_ID}.json`));
    expect(bundle.schemaVersion).toBe(2);
    expect(bundle.bundle.id).toBe(KIT_ID);
    expect(bundle.bundle.kitId).toBe(KIT_ID);
    expect(bundle.bundle.workerId).toBe(WORKER_ID);
    expect(bundle.briefType).toBe(BRIEF_TYPE);
    expect(bundle.export.folderName).toBe("growthub-agent-worker-kit-agency-portal-starter-v1");
    expect(bundle.export.zipFileName).toBe("growthub-agent-worker-kit-agency-portal-starter-v1.zip");
  });

  it("SKILL.md uses SDK v1 primitive fields and adapter criteria", () => {
    const skill = readText("SKILL.md");
    expect(skill).toContain("sessionMemory:");
    expect(skill).toContain("selfEval:");
    expect(skill).toContain("traceTo: .growthub-fork/trace.jsonl");
    expect(skill).toContain("AGENCY_PORTAL_DATA_ADAPTER");
    expect(skill).toContain("studio/");
    expect(skill).toContain("apps/agency-portal/");
  });
});

describe("growthub-agency-portal-starter-v1 — adapter-first app payload", () => {
  it("ships a Next.js app without provider-specific database dependencies", () => {
    const packageJson = JSON.parse(readText("apps/agency-portal/package.json"));
    expect(packageJson.dependencies.next).toBe("16.2.4");
    expect(Object.keys(packageJson.dependencies).sort()).toEqual([
      "next",
      "react",
      "react-dom",
    ]);
    expect(packageJson.scripts).toMatchObject({
      dev: "next dev",
      build: "next build",
    });
  });

  it("documents Postgres, Qstash KV, auth, and payment adapters", () => {
    const env = readText(".env.example");
    expect(env).toContain("AGENCY_PORTAL_DATA_ADAPTER");
    expect(env).toContain("DATABASE_URL");
    expect(env).toContain("QSTASH_KV_REST_URL");
    expect(env).toContain("AGENCY_PORTAL_AUTH_ADAPTER");
    expect(env).toContain("AGENCY_PORTAL_PAYMENT_ADAPTER");
    expect(env).toContain("AGENCY_PORTAL_INTEGRATION_ADAPTER");
    expect(env).toContain("GROWTHUB_BRIDGE_BASE_URL");
    expect(env).toContain("GROWTHUB_BRIDGE_USER_ID");
    expect(env).toContain("WINDSOR_API_KEY");

    const adapterDoc = readText("docs/adapter-contracts.md");
    expect(adapterDoc).toContain("postgres");
    expect(adapterDoc).toContain("qstash-kv");
    expect(adapterDoc).toContain("provider-managed");
    expect(adapterDoc).toContain("Windsor AI");
    expect(adapterDoc).toContain("WINDSOR_API_KEY");
    expect(adapterDoc).toContain("Google Sheets blended data");
    expect(adapterDoc).toContain("mcp_connections");
    expect(adapterDoc).toContain("growthub-connection-normalizer.js");
    expect(adapterDoc).toContain("\"accounts\"");
  });
});
