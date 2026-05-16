/**
 * Belt-and-suspenders test: the kit's sanitizeWorkspaceSnapshot must never
 * let a row, envRef, token, or top-level secret reach the helper system
 * prompt — regardless of whether the caller passes a live config or a
 * pre-sanitized snapshot. The query route uses this same fn after my fix,
 * so this contract guards both surfaces.
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — JS module under apps/workspace; resolved via Node ESM
import { sanitizeWorkspaceSnapshot, buildHelperSystemPrompt } from "../../assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-helper.js";

const tokens = [
  "sk-leak-1234",
  "sk-leak-row",
  "OPENAI_API_KEY",
  "GROWTHUB_API_KEY",
];

describe("sanitizeWorkspaceSnapshot", () => {
  it("strips envRefs, rows, and top-level secrets from a live config", () => {
    const evil = {
      id: "ws", name: "ws",
      envRefs: { OPENAI_API_KEY: "sk-leak-1234" },
      secrets: { GROWTHUB: "sk-leak-1234" },
      dataModel: {
        objects: [{
          id: "x", label: "X", objectType: "people", columns: ["Name"],
          rows: [{ Name: "Alice", envRef: "GROWTHUB_API_KEY", token: "sk-leak-row" }],
        }],
      },
      dashboards: [{ id: "d", name: "D", status: "draft", secret: "sk-leak-1234" }],
      widgetTypes: [{ kind: "chart", label: "Chart", apiKey: "sk-leak-1234" }],
    };
    const snap = sanitizeWorkspaceSnapshot(evil);
    expect(snap.dataModelObjects[0]).not.toHaveProperty("rows");
    expect(snap.dataModelObjects[0]).toEqual({ id: "x", label: "X", objectType: "people", columns: ["Name"], rowCount: 1 });
    const sys = buildHelperSystemPrompt(snap, "create_object");
    for (const t of tokens) {
      expect(sys.includes(t)).toBe(false);
    }
  });

  it("re-sanitizes a client-supplied snapshot shape and drops smuggled fields", () => {
    const snapInput = {
      workspaceId: "y", workspaceName: "Y",
      dataModelObjects: [{ id: "x", label: "X", objectType: "people", columns: ["Name"], rowCount: 3, rows: [{ token: "sk-leak-row" }] }],
      dashboards: [{ id: "d", name: "D", secret: "sk-leak-1234" }],
      widgetTypes: [{ kind: "chart", label: "Chart", apiKey: "sk-leak-1234" }],
      canvasSummary: { widgetCount: 0, tabCount: 1 },
    };
    const snap = sanitizeWorkspaceSnapshot(snapInput);
    expect(snap.dataModelObjects[0]).not.toHaveProperty("rows");
    expect(snap.dataModelObjects[0].rowCount).toBe(3);
    const sys = buildHelperSystemPrompt(snap, "edit_view");
    for (const t of tokens) {
      expect(sys.includes(t)).toBe(false);
    }
  });

  it("returns empty snapshot for non-object input", () => {
    expect(sanitizeWorkspaceSnapshot(null)).toEqual({});
    expect(sanitizeWorkspaceSnapshot(undefined as unknown as object)).toEqual({});
    expect(sanitizeWorkspaceSnapshot("nope" as unknown as object)).toEqual({});
  });
});
