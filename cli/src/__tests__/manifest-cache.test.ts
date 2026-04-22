/**
 * Manifest Cache — Unit Tests
 *
 * Covers:
 *   - atomic write to envelope.json
 *   - prior envelope rotation to envelope.prev.json
 *   - drift stamping on rewrites
 *   - in-fork snapshot round trip
 *   - machine index upsert
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CapabilityManifest, CapabilityManifestEnvelope } from "@growthub/api-contract";
import {
  loadCachedEnvelope,
  loadPrevEnvelope,
  writeEnvelope,
  listCachedHosts,
} from "../runtime/manifest-registry/cache.js";
import { loadForkEnvelope, writeForkEnvelope } from "../runtime/manifest-registry/index.js";

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

function envelope(host: string, capabilities: CapabilityManifest[]): CapabilityManifestEnvelope {
  return {
    version: 1,
    host,
    fetchedAt: new Date().toISOString(),
    source: "hosted",
    capabilities,
  };
}

let homeDir: string;
let prevEnv: string | undefined;

beforeEach(() => {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-home-"));
  prevEnv = process.env.GROWTHUB_MANIFEST_HOME;
  process.env.GROWTHUB_MANIFEST_HOME = homeDir;
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.GROWTHUB_MANIFEST_HOME;
  else process.env.GROWTHUB_MANIFEST_HOME = prevEnv;
  fs.rmSync(homeDir, { recursive: true, force: true });
});

describe("manifest cache", () => {
  it("writes envelope.json and indexes the host", () => {
    const env = envelope("https://example.test", [makeManifest("image-gen")]);
    const result = writeEnvelope(env);
    expect(fs.existsSync(result.envelopePath)).toBe(true);

    const loaded = loadCachedEnvelope("https://example.test");
    expect(loaded?.capabilities).toHaveLength(1);

    const hosts = listCachedHosts();
    expect(hosts).toHaveLength(1);
    expect(hosts[0].host).toBe("https://example.test");
  });

  it("rotates the prior envelope into envelope.prev.json and stamps drift", () => {
    const env1 = envelope("https://example.test", [makeManifest("image-gen")]);
    writeEnvelope(env1);

    const env2 = envelope("https://example.test", [makeManifest("image-gen"), makeManifest("video-gen")]);
    const result = writeEnvelope(env2);

    expect(loadPrevEnvelope("https://example.test")?.capabilities).toHaveLength(1);
    expect(result.drift?.markers.some((m) => m.change === "added" && m.slug === "video-gen")).toBe(true);

    const persisted = loadCachedEnvelope("https://example.test");
    expect(persisted?.drift?.markers ?? []).not.toHaveLength(0);
  });
});

describe("fork snapshot round trip", () => {
  it("writes and reads an envelope from <forkPath>/.growthub-fork/manifest.json", () => {
    const forkPath = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-fork-"));
    const env = envelope("https://example.test", [makeManifest("image-gen")]);
    const written = writeForkEnvelope(forkPath, env);
    expect(fs.existsSync(written)).toBe(true);
    expect(written).toMatch(/\.growthub-fork\/manifest\.json$/);
    const loaded = loadForkEnvelope(forkPath);
    expect(loaded?.capabilities).toHaveLength(1);
    fs.rmSync(forkPath, { recursive: true, force: true });
  });
});
