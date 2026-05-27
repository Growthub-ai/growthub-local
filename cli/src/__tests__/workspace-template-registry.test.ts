import { describe, expect, it, beforeEach } from "vitest";

import {
  listWorkspaceTemplates,
  resolveWorkspaceTemplate,
  isWorkspaceTemplateId,
  workspaceTemplateToKitListItem,
  __resetWorkspaceTemplateCache,
} from "../kits/workspace-template-registry.js";

describe("workspace-template-registry", () => {
  beforeEach(() => {
    __resetWorkspaceTemplateCache();
  });

  it("loads the project-management entry from the manifest", () => {
    const templates = listWorkspaceTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(1);
    const pm = templates.find((t) => t.slug === "project-management");
    expect(pm).toBeDefined();
    expect(pm!.id).toBe("project-management-workspace-template-v1");
    expect(pm!.seedConfig).toBe("project-management");
    expect(pm!.family).toBe("studio");
    expect(pm!.bundleId).toBe("growthub-custom-workspace-starter-v1");
  });

  it("resolves a template by id, slug, and alias", () => {
    expect(resolveWorkspaceTemplate("project-management-workspace-template-v1")?.slug).toBe("project-management");
    expect(resolveWorkspaceTemplate("project-management")?.slug).toBe("project-management");
    expect(resolveWorkspaceTemplate("project-management-workspace")?.slug).toBe("project-management");
  });

  it("returns null for unknown ids", () => {
    expect(resolveWorkspaceTemplate("does-not-exist")).toBeNull();
    expect(resolveWorkspaceTemplate("")).toBeNull();
    expect(isWorkspaceTemplateId("does-not-exist")).toBe(false);
  });

  it("is case-insensitive on lookup", () => {
    expect(resolveWorkspaceTemplate("PROJECT-MANAGEMENT")?.slug).toBe("project-management");
    expect(isWorkspaceTemplateId("Project-Management-Workspace")).toBe(true);
  });

  it("returns a snapshot, not the internal array", () => {
    const a = listWorkspaceTemplates();
    const b = listWorkspaceTemplates();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("converts an entry into a KitListItem with narrowed unions", () => {
    const entry = resolveWorkspaceTemplate("project-management");
    expect(entry).not.toBeNull();
    const item = workspaceTemplateToKitListItem(entry!);
    expect(item).toMatchObject({
      id: "project-management-workspace-template-v1",
      type: "worker",
      family: "studio",
      executionMode: "export",
      activationModes: ["export"],
      briefType: "workspace-template",
    });
  });
});
