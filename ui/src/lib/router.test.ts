import { describe, expect, it } from "vitest";
import { applySurfaceMount } from "./router";

describe("applySurfaceMount", () => {
  it("keeps global routes unprefixed", () => {
    expect(applySurfaceMount("/auth")).toBe("/auth");
    expect(applySurfaceMount("/instance/settings/heartbeats")).toBe("/instance/settings/heartbeats");
  });

  it("prefixes dx board routes with the dx mount", () => {
    expect(applySurfaceMount("/GHD/dashboard")).toBe("/dx/GHD/dashboard");
    expect(applySurfaceMount("/agents/ceo")).toBe("/dx/agents/ceo");
  });

  it("does not double-prefix already mounted dx routes", () => {
    expect(applySurfaceMount("/dx/GHD/dashboard")).toBe("/dx/GHD/dashboard");
  });
});
