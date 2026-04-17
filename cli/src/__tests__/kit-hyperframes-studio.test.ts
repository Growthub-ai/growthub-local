import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BUNDLED_KIT_CATALOG } from "../kits/catalog.js";
import { inspectBundledKit, listBundledKits } from "../kits/service.js";

const KIT_ID = "growthub-hyperframes-studio-v1";
const WORKER_ID = "hyperframes-studio-operator";
const KIT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets/worker-kits/growthub-hyperframes-studio-v1",
);

function readJson(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(KIT_ROOT, relativePath), "utf8"));
}

describe("growthub-hyperframes-studio-v1", () => {
  it("is registered in catalog and discovery", () => {
    const catalogEntry = BUNDLED_KIT_CATALOG.find((kit) => kit.id === KIT_ID);
    expect(catalogEntry).toMatchObject({
      id: KIT_ID,
      packageDirName: KIT_ID,
      defaultBundleId: KIT_ID,
      family: "studio",
      executionMode: "export",
      activationModes: ["export"],
    });

    const listed = listBundledKits().find((kit) => kit.id === KIT_ID);
    expect(listed).toBeDefined();
    expect(listed?.briefType).toBe("hyperframes-video-production");
  });

  it("has consistent manifest and bundle ids", () => {
    const manifest = readJson("kit.json");
    const bundle = readJson("bundles/growthub-hyperframes-studio-v1.json");

    expect(manifest.kit.id).toBe(KIT_ID);
    expect(manifest.entrypoint.workerId).toBe(WORKER_ID);
    expect(bundle.bundle.kitId).toBe(KIT_ID);
    expect(bundle.bundle.workerId).toBe(WORKER_ID);
  });

  it("has all frozen and required assets on disk", () => {
    const manifest = readJson("kit.json");
    const bundle = readJson("bundles/growthub-hyperframes-studio-v1.json");

    for (const rel of manifest.frozenAssetPaths) {
      expect(fs.existsSync(path.join(KIT_ROOT, rel)), `missing frozen asset ${rel}`).toBe(true);
    }
    for (const rel of bundle.requiredFrozenAssets) {
      expect(fs.existsSync(path.join(KIT_ROOT, rel)), `missing required frozen asset ${rel}`).toBe(true);
    }
  });

  it("exposes required setup and quickstart paths", () => {
    const info = inspectBundledKit(KIT_ID);
    expect(info.requiredPaths).toContain(".env.example");
    expect(info.requiredPaths).toContain("QUICKSTART.md");
    expect(info.requiredPaths).toContain("setup/clone-fork.sh");
  });
});
