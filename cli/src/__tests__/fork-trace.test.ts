/**
 * Kit Fork Trace — Unit Tests
 *
 * Covers:
 *   - appendKitForkTraceEvent writes JSONL into <forkPath>/.growthub-fork/trace.jsonl
 *   - readKitForkTrace deserialises every line
 *   - malformed lines are tolerated, not thrown
 *   - tailKitForkTrace returns the last N events in order
 *   - timestamps are auto-populated when not supplied
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendKitForkTraceEvent,
  readKitForkTrace,
  tailKitForkTrace,
} from "../kits/fork-trace.js";

function makeForkDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fork-trace-"));
}

describe("appendKitForkTraceEvent", () => {
  it("writes a JSONL line at <forkPath>/.growthub-fork/trace.jsonl", () => {
    const dir = makeForkDir();
    const event = appendKitForkTraceEvent(dir, {
      forkId: "fork-a",
      kitId: "creative-strategist-v1",
      type: "registered",
      summary: "Test registration",
    });
    expect(event.timestamp).toBeTruthy();
    const p = path.resolve(dir, ".growthub-fork", "trace.jsonl");
    expect(fs.existsSync(p)).toBe(true);
    const contents = fs.readFileSync(p, "utf8");
    expect(contents.endsWith("\n")).toBe(true);
    expect(contents.split("\n").filter(Boolean)).toHaveLength(1);
  });

  it("honours a supplied timestamp when given", () => {
    const dir = makeForkDir();
    const ts = "2024-01-01T00:00:00.000Z";
    const event = appendKitForkTraceEvent(dir, {
      forkId: "fork-a", kitId: "creative-strategist-v1",
      type: "heal_applied", summary: "test", timestamp: ts,
    });
    expect(event.timestamp).toBe(ts);
  });

  it("appends rather than overwrites", () => {
    const dir = makeForkDir();
    appendKitForkTraceEvent(dir, { forkId: "x", kitId: "y", type: "status_ran", summary: "one" });
    appendKitForkTraceEvent(dir, { forkId: "x", kitId: "y", type: "status_ran", summary: "two" });
    const events = readKitForkTrace(dir);
    expect(events).toHaveLength(2);
    expect(events[0].summary).toBe("one");
    expect(events[1].summary).toBe("two");
  });
});

describe("readKitForkTrace", () => {
  it("returns [] when trace.jsonl does not exist", () => {
    const dir = makeForkDir();
    expect(readKitForkTrace(dir)).toEqual([]);
  });

  it("tolerates malformed lines without throwing", () => {
    const dir = makeForkDir();
    const p = path.resolve(dir, ".growthub-fork", "trace.jsonl");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, [
      JSON.stringify({ timestamp: "t", forkId: "a", kitId: "b", type: "registered", summary: "ok" }),
      "this is not json",
      "",
      JSON.stringify({ timestamp: "t2", forkId: "a", kitId: "b", type: "status_ran", summary: "still ok" }),
    ].join("\n") + "\n");
    const events = readKitForkTrace(dir);
    expect(events).toHaveLength(2);
    expect(events[0].summary).toBe("ok");
    expect(events[1].summary).toBe("still ok");
  });
});

describe("tailKitForkTrace", () => {
  it("returns the last N events in original order", () => {
    const dir = makeForkDir();
    for (const summary of ["a", "b", "c", "d", "e"]) {
      appendKitForkTraceEvent(dir, { forkId: "x", kitId: "y", type: "status_ran", summary });
    }
    const last3 = tailKitForkTrace(dir, 3);
    expect(last3.map((e) => e.summary)).toEqual(["c", "d", "e"]);
  });

  it("returns all events when N > total", () => {
    const dir = makeForkDir();
    appendKitForkTraceEvent(dir, { forkId: "x", kitId: "y", type: "status_ran", summary: "only" });
    expect(tailKitForkTrace(dir, 100).map((e) => e.summary)).toEqual(["only"]);
  });
});
