/**
 * Bindings Store — Unit Tests
 *
 * Covers save/load/list/delete round trip inside a fork, and drift
 * comparison against the current NodeInputSchema.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NodeInputSchema } from "@growthub/api-contract";
import {
  saveBindings,
  loadBindings,
  listBindings,
  deleteBindings,
  compareRecordToSchema,
} from "../runtime/cms-node-contracts/bindings-store.js";

let forkPath: string;

beforeEach(() => {
  forkPath = fs.mkdtempSync(path.join(os.tmpdir(), "bindings-fork-"));
});

afterEach(() => {
  fs.rmSync(forkPath, { recursive: true, force: true });
});

describe("bindings-store", () => {
  it("saves and reloads a record round-trip", () => {
    const record = saveBindings(forkPath, "image-gen", "safe-prompt", { prompt: "hi", count: 1 });
    expect(record.slug).toBe("image-gen");
    expect(record.name).toBe("safe-prompt");
    const loaded = loadBindings(forkPath, "image-gen", "safe-prompt");
    expect(loaded?.bindings).toEqual({ prompt: "hi", count: 1 });
    expect(loaded?.schemaVersion).toBe(1);
  });

  it("lists records across slugs", () => {
    saveBindings(forkPath, "image-gen", "a", { prompt: "x" });
    saveBindings(forkPath, "video-gen", "b", { prompt: "y" });
    const all = listBindings(forkPath);
    expect(all.map((r) => `${r.slug}/${r.name}`).sort()).toEqual(["image-gen/a", "video-gen/b"]);
    const onlyImage = listBindings(forkPath, "image-gen");
    expect(onlyImage).toHaveLength(1);
  });

  it("deletes a record", () => {
    saveBindings(forkPath, "image-gen", "gone", { prompt: "x" });
    expect(deleteBindings(forkPath, "image-gen", "gone")).toBe(true);
    expect(loadBindings(forkPath, "image-gen", "gone")).toBeNull();
  });

  it("sanitizes dangerous names", () => {
    const rec = saveBindings(forkPath, "image-gen", "Hello World!", { prompt: "x" });
    expect(rec.name).toBe("hello-world-");
    expect(loadBindings(forkPath, "image-gen", "Hello World!")).not.toBeNull();
  });

  it("reports drift against a newer schema", () => {
    const rec = saveBindings(forkPath, "image-gen", "old", { legacy_key: "x" });
    const schema: NodeInputSchema = {
      fields: [
        { key: "prompt", label: "Prompt", required: true, fieldType: "long-text" },
      ],
    };
    const drift = compareRecordToSchema(rec, schema);
    expect(drift.missingKeys).toContain("prompt");
    expect(drift.extraKeys).toContain("legacy_key");
  });
});
