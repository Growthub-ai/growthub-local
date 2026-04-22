/**
 * Attachment Lift — Unit Tests
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NodeInputSchema } from "@growthub/api-contract";
import { liftAttachments } from "../runtime/cms-node-contracts/attachment-lift.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lift-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const schema: NodeInputSchema = {
  fields: [
    { key: "image", label: "Image", required: false, fieldType: "url-or-file" },
    { key: "prompt", label: "Prompt", required: true, fieldType: "text" },
  ],
};

describe("liftAttachments", () => {
  it("lifts a local path into a NodeInputAttachment", () => {
    const file = path.resolve(tmp, "cat.png");
    fs.writeFileSync(file, "bytes");
    const result = liftAttachments(schema, { image: file, prompt: "hi" });
    expect(result.attachments.get("image")).toMatchObject({
      kind: "file",
      absolutePath: file,
      mediaType: "image/png",
    });
    expect(result.bindings.image).toBe(file);
  });

  it("passes URLs through untouched", () => {
    const result = liftAttachments(schema, { image: "https://example.test/a.png", prompt: "hi" });
    expect(result.attachments.size).toBe(0);
    expect(result.bindings.image).toBe("https://example.test/a.png");
  });

  it("ignores non-existent paths", () => {
    const result = liftAttachments(schema, { image: "/no/such/file.png", prompt: "hi" });
    expect(result.attachments.size).toBe(0);
  });

  it("skips non-file fields", () => {
    const result = liftAttachments(schema, { prompt: "hi" });
    expect(result.attachments.size).toBe(0);
  });
});
