/**
 * Local Extension Manifests — Unit Tests
 *
 * Covers:
 *   - loading valid extensions from <workspace>/.growthub/manifests/*.json
 *   - stamping provenance.originType = "local-extension"
 *   - skipping malformed files instead of throwing
 *   - slug-based override in mergeLocalExtensions
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CapabilityManifest } from "@growthub/api-contract";
import {
  loadLocalExtensionManifests,
  mergeLocalExtensions,
  resolveWorkspaceExtensionDir,
} from "../runtime/manifest-registry/local-extensions.js";

function makeManifest(slug: string): CapabilityManifest {
  return {
    slug,
    family: "ops",
    displayName: slug,
    executionKind: "hosted-execute",
    requiredBindings: [],
    outputTypes: [],
    node: {
      slug,
      displayName: slug,
      icon: "",
      family: "ops",
      category: "automation",
      nodeType: "tool_execution",
      executionKind: "hosted-execute",
      executionBinding: { type: "mcp_tool_call", strategy: "direct" },
      executionTokens: { tool_name: slug, input_template: {}, output_mapping: {} },
      requiredBindings: [],
      outputTypes: [],
      enabled: true,
      experimental: false,
      visibility: "authenticated",
    },
    provenance: { originType: "hosted", recordedAt: new Date().toISOString() },
  };
}

function writeExtension(workspace: string, file: string, contents: unknown): string {
  const dir = resolveWorkspaceExtensionDir(workspace);
  fs.mkdirSync(dir, { recursive: true });
  const full = path.resolve(dir, file);
  fs.writeFileSync(full, JSON.stringify(contents), "utf8");
  return full;
}

describe("local extension manifests", () => {
  it("loads a single manifest and stamps provenance", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
    const filePath = writeExtension(workspace, "custom.json", makeManifest("custom-node"));
    const loaded = loadLocalExtensionManifests(workspace);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].slug).toBe("custom-node");
    expect(loaded[0].provenance.originType).toBe("local-extension");
    expect(loaded[0].provenance.localExtensionPath).toBe(filePath);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("loads arrays of manifests", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
    writeExtension(workspace, "pack.json", [makeManifest("a"), makeManifest("b")]);
    const loaded = loadLocalExtensionManifests(workspace);
    expect(loaded.map((m) => m.slug).sort()).toEqual(["a", "b"]);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("skips malformed files without throwing", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
    fs.mkdirSync(resolveWorkspaceExtensionDir(workspace), { recursive: true });
    fs.writeFileSync(
      path.resolve(resolveWorkspaceExtensionDir(workspace), "bad.json"),
      "not json",
      "utf8",
    );
    writeExtension(workspace, "good.json", makeManifest("good"));
    const loaded = loadLocalExtensionManifests(workspace);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].slug).toBe("good");
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("merges extensions over base manifests by slug", () => {
    const base = [makeManifest("image-gen"), makeManifest("video-gen")];
    const ext = makeManifest("image-gen");
    ext.displayName = "Overridden";
    const merged = mergeLocalExtensions(base, [ext]);
    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.slug === "image-gen")?.displayName).toBe("Overridden");
  });
});
