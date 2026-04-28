/**
 * compose.test.ts — covers the SDK widget/composition contract surface
 * (`@growthub/api-contract/widgets` + `/compositions`) and the CLI's
 * `growthub compose` validator round-trip.
 *
 * Why these properties matter
 * ---------------------------
 *
 *   - Identity helpers (`defineComposition`, `defineCanvas`,
 *     `defineWidget`, `defineIntegration`, `definePortalCapability`,
 *     `definePortalObject`) MUST be pure passthroughs. Non-determinism
 *     would break manifest diffing and fork-sync drift detection
 *     (`cli/src/kits/fork-sync.ts::detectKitForkDrift`).
 *
 *   - `groupIntegrationsByLane` MUST partition the array as the
 *     production agency-portal helper does
 *     (`apps/agency-portal/lib/domain/integrations.js:176-183`).
 *
 *   - `assertComposition` (the CLI structural validator) MUST accept
 *     the production manifests shipped by the agency-portal and
 *     custom-workspace-starter kits, and reject manifests missing
 *     required fields with deterministic error tails.
 *
 *   - `buildStarterComposition` MUST emit a manifest that round-trips
 *     through `assertComposition` cleanly.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  COMPOSITIONS_CONTRACT_VERSION,
  defineCanvas,
  defineComposition,
  defineIntegration,
  definePortalCapability,
  definePortalObject,
  defineWidget,
  groupIntegrationsByLane,
  type Composition,
  type PortalIntegration,
} from "@growthub/api-contract/compositions";
import { WIDGETS_CONTRACT_VERSION } from "@growthub/api-contract/widgets";
import {
  assertComposition,
  buildStarterComposition,
} from "../commands/compose.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../../..");
const agencyPortalManifest = path.resolve(
  repoRoot,
  "cli/assets/worker-kits/growthub-agency-portal-starter-v1/apps/agency-portal/growthub.config.json",
);
const customWorkspaceManifest = path.resolve(
  repoRoot,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/growthub.config.json",
);

describe("@growthub/api-contract — version sentinels", () => {
  it("freezes contract versions at v1", () => {
    expect(COMPOSITIONS_CONTRACT_VERSION).toBe(1);
    expect(WIDGETS_CONTRACT_VERSION).toBe(1);
  });
});

describe("@growthub/api-contract/compositions — identity helpers are pure passthroughs", () => {
  it("defineComposition returns the spec verbatim (referential equality)", () => {
    const spec = { id: "x", canvas: undefined };
    expect(defineComposition(spec)).toBe(spec);
  });

  it("defineCanvas returns the spec verbatim", () => {
    const spec = { id: "c", layout: { columns: 4 }, widgets: [] };
    expect(defineCanvas(spec)).toBe(spec);
  });

  it("defineWidget returns the spec verbatim", () => {
    const spec = {
      id: "w",
      kind: "chart-metric" as const,
      position: { x: 0, y: 0, w: 1, h: 1 },
    };
    expect(defineWidget(spec)).toBe(spec);
  });

  it("definePortalCapability / definePortalObject / defineIntegration return the spec verbatim", () => {
    const cap = { id: "dashboard" };
    const obj = { id: "client", fields: [{ name: "name", type: "text" as const }] };
    const integ = { id: "windsor-ai", lane: "data-source" as const };
    expect(definePortalCapability(cap)).toBe(cap);
    expect(definePortalObject(obj)).toBe(obj);
    expect(defineIntegration(integ)).toBe(integ);
  });
});

describe("@growthub/api-contract/compositions — groupIntegrationsByLane", () => {
  const rows: PortalIntegration[] = [
    { id: "windsor-ai", lane: "data-source" },
    { id: "shopify", lane: "data-source" },
    { id: "slack", lane: "workspace-integration" },
    { id: "kit-defined", lane: "custom-lane" },
  ];

  it("partitions data-source / workspace-integration lanes", () => {
    const grouped = groupIntegrationsByLane(rows);
    expect(grouped.dataSources.map((r) => r.id)).toEqual([
      "windsor-ai",
      "shopify",
    ]);
    expect(grouped.workspaceIntegrations.map((r) => r.id)).toEqual(["slack"]);
  });

  it("preserves input order within lanes (stable sort)", () => {
    const grouped = groupIntegrationsByLane([...rows].reverse());
    expect(grouped.dataSources.map((r) => r.id)).toEqual([
      "shopify",
      "windsor-ai",
    ]);
  });

  it("omits open-ended lane values from both partitions", () => {
    const grouped = groupIntegrationsByLane(rows);
    expect(
      [...grouped.dataSources, ...grouped.workspaceIntegrations].some(
        (r) => r.id === "kit-defined",
      ),
    ).toBe(false);
  });

  it("returns empty arrays for empty input (no throw)", () => {
    const grouped = groupIntegrationsByLane([]);
    expect(grouped.dataSources).toEqual([]);
    expect(grouped.workspaceIntegrations).toEqual([]);
  });
});

describe("growthub compose — buildStarterComposition", () => {
  it("emits a deterministic shape (no Date.now / Math.random in output ids)", () => {
    const a = buildStarterComposition("smoke", "Smoke Composition");
    const b = buildStarterComposition("smoke", "Smoke Composition");
    // strip provenance.createdAt — it is the only intentionally non-
    // deterministic field in the starter, set when the user runs
    // `growthub compose new`.
    delete a.provenance?.createdAt;
    delete b.provenance?.createdAt;
    expect(a).toEqual(b);
  });

  it("round-trips through assertComposition cleanly", () => {
    const comp = buildStarterComposition("rt", "Round-trip");
    expect(() => assertComposition(comp, "<starter>")).not.toThrow();
  });

  it("starter widgets cover the four agent-native + Twenty-parity kinds", () => {
    const comp = buildStarterComposition("kinds", "Kinds Coverage");
    const kinds = (comp.canvas?.widgets ?? []).map((w) => w.kind);
    expect(kinds).toContain("chart-metric");
    expect(kinds).toContain("integration-card");
    expect(kinds).toContain("chat-session");
    expect(kinds).toContain("workflow-runner");
    expect(kinds).toContain("artifact-viewer");
  });
});

describe("growthub compose — assertComposition (structural validator)", () => {
  it("rejects non-objects with a deterministic error tail", () => {
    expect(() => assertComposition(null, "<src>")).toThrow(
      /<src>: composition must be a JSON object/,
    );
    expect(() => assertComposition([1, 2], "<src>")).toThrow(
      /<src>: composition must be a JSON object/,
    );
  });

  it("rejects missing composition.id", () => {
    expect(() => assertComposition({}, "<src>")).toThrow(
      /composition\.id is required/,
    );
  });

  it("rejects canvas missing required fields", () => {
    expect(() =>
      assertComposition(
        { id: "x", canvas: { widgets: [] } },
        "<src>",
      ),
    ).toThrow(/canvas\.id is required/);

    expect(() =>
      assertComposition(
        { id: "x", canvas: { id: "c", widgets: [] } },
        "<src>",
      ),
    ).toThrow(/canvas\.layout\.columns is required/);
  });

  it("rejects widgets missing id / kind / position", () => {
    const base = {
      id: "x",
      canvas: {
        id: "c",
        layout: { columns: 4 },
        widgets: [{ kind: "chart-metric", position: { x: 0, y: 0, w: 1, h: 1 } }],
      },
    };
    expect(() => assertComposition(base, "<src>")).toThrow(
      /canvas\.widgets\[0\]\.id is required/,
    );

    const missingKind = JSON.parse(JSON.stringify(base));
    missingKind.canvas.widgets[0] = {
      id: "w",
      position: { x: 0, y: 0, w: 1, h: 1 },
    };
    expect(() => assertComposition(missingKind, "<src>")).toThrow(
      /canvas\.widgets\[0\]\.kind is required/,
    );

    const badPos = JSON.parse(JSON.stringify(base));
    badPos.canvas.widgets[0] = {
      id: "w",
      kind: "chart-metric",
      position: { x: 0, y: 0 },
    };
    expect(() => assertComposition(badPos, "<src>")).toThrow(
      /canvas\.widgets\[0\]\.position must include x,y,w,h numbers/,
    );
  });

  it("accepts a composition without a canvas", () => {
    const minimal = { id: "minimal", capabilities: [], pipelines: [] };
    expect(() => assertComposition(minimal, "<src>")).not.toThrow();
  });
});

describe("growthub compose — production manifests round-trip", () => {
  it("agency-portal kit ships a valid composition", () => {
    expect(fs.existsSync(agencyPortalManifest)).toBe(true);
    const raw = fs.readFileSync(agencyPortalManifest, "utf8");
    const parsed = JSON.parse(raw) as Composition;
    expect(() => assertComposition(parsed, agencyPortalManifest)).not.toThrow();
    expect(parsed.id).toBe("agency-portal-default");
    expect(parsed.canvas?.widgets.length).toBeGreaterThan(0);
  });

  it("custom-workspace-starter kit ships a valid composition", () => {
    expect(fs.existsSync(customWorkspaceManifest)).toBe(true);
    const raw = fs.readFileSync(customWorkspaceManifest, "utf8");
    const parsed = JSON.parse(raw) as Composition;
    expect(() =>
      assertComposition(parsed, customWorkspaceManifest),
    ).not.toThrow();
    expect(parsed.id).toBe("custom-workspace-default");
  });
});
