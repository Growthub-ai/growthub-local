import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BUNDLED_KIT_CATALOG } from "../kits/catalog.js";
import { inspectBundledKit, listBundledKits, fuzzyResolveKitId } from "../kits/service.js";

const KIT_ID = "growthub-video-use-studio-v1";
const WORKER_ID = "video-use-studio-operator";
const KIT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets/worker-kits/growthub-video-use-studio-v1",
);

function readJson(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(KIT_ROOT, relativePath), "utf8"));
}

describe("growthub-video-use-studio-v1", () => {
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
    expect(listed?.briefType).toBe("video-use-conversational-edit");
  });

  it("resolves 'video-use' via fuzzy slug", () => {
    expect(fuzzyResolveKitId("video-use")).toBe(KIT_ID);
    expect(fuzzyResolveKitId("growthub-video-use-studio-v1")).toBe(KIT_ID);
  });

  it("has consistent manifest and bundle ids", () => {
    const manifest = readJson("kit.json");
    const bundle = readJson("bundles/growthub-video-use-studio-v1.json");

    expect(manifest.kit.id).toBe(KIT_ID);
    expect(manifest.entrypoint.workerId).toBe(WORKER_ID);
    expect(bundle.bundle.kitId).toBe(KIT_ID);
    expect(bundle.bundle.workerId).toBe(WORKER_ID);
  });

  it("has all frozen and required assets on disk", () => {
    const manifest = readJson("kit.json");
    const bundle = readJson("bundles/growthub-video-use-studio-v1.json");

    for (const rel of manifest.frozenAssetPaths) {
      expect(fs.existsSync(path.join(KIT_ROOT, rel)), `missing frozen asset ${rel}`).toBe(true);
    }
    for (const rel of bundle.requiredFrozenAssets) {
      expect(fs.existsSync(path.join(KIT_ROOT, rel)), `missing required frozen asset ${rel}`).toBe(true);
    }
  });

  it("exposes required setup, quickstart and install-skill paths", () => {
    const info = inspectBundledKit(KIT_ID);
    expect(info.requiredPaths).toContain(".env.example");
    expect(info.requiredPaths).toContain("QUICKSTART.md");
    expect(info.requiredPaths).toContain("setup/clone-fork.sh");
    expect(info.requiredPaths).toContain("setup/install-skill.sh");
  });

  it("declares the ELEVENLABS_API_KEY requirement in .env.example", () => {
    const envExample = fs.readFileSync(path.join(KIT_ROOT, ".env.example"), "utf8");
    expect(envExample).toMatch(/VIDEO_USE_HOME=/);
    expect(envExample).toMatch(/ELEVENLABS_API_KEY=/);
  });
});
