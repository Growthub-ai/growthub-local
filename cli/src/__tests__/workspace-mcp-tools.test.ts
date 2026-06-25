/**
 * MCP contract smoke test (review hardening #6).
 *
 * The MCP surface is the contract external agents (Codex / Claude Code) consume,
 * so its shape is product-critical: it must expose read + dry-run + guidance
 * tools and NEVER a direct write/execute (mutation) tool. This asserts that
 * boundary plus the truthful-source / dry-run-mode behaviour the review flagged.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildMcpTools } from "../commands/workspace-derivation-commands.js";
import { loadDerivers, loadGraphHelpers } from "../runtime/workspace-derivations.js";

const node = (id: string, type: string, summary: Record<string, unknown> = {}) => ({ id, type, label: id, summary, metadataId: id });

async function offlineCtx() {
  const d = await loadDerivers();
  const h = await loadGraphHelpers();
  return {
    workspaceConfig: { id: "test-ws", name: "Test" },
    store: { objects: [], fields: [], widgets: [], dashboards: [], workflows: [], workflowNodes: [], sandboxes: [], integrations: [], runs: [], pipelineHealth: [], provenance: [], outputArtifacts: [] },
    graph: { nodes: [node("obj", "dataModelObject"), node("src", "sourceRecord")], edges: [{ id: "obj::backedBySourceRecord::src", from: "obj", to: "src", relation: "backedBySourceRecord" }] },
    d, h, liveUrl: null, source: "offline-config",
  };
}

const find = (name: string) => buildMcpTools().find((t) => t.name === name);

describe("MCP tool registry — contract & boundary", () => {
  it("exposes the read + dry-run + guidance tools", () => {
    const names = buildMcpTools().map((t) => t.name);
    for (const expected of [
      "describe_workspace", "list_data_model", "list_dashboards", "list_workflows", "list_integrations",
      "outcome_ledger", "describe_node", "get_workspace_topology", "find_downstream_dependencies",
      "simulate_causal_impact", "trace_lineage", "app_readiness", "minimal_change_set",
      "preflight_patch", "next_actions",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("exposes NO direct write/execute (mutation) tool — no third mutation path", () => {
    const names = buildMcpTools().map((t) => t.name);
    const forbidden = /patch_workspace|publish_workflow|run_sandbox|apply_helper|mutate|^write_|^execute_|^delete_/;
    expect(names.filter((n) => forbidden.test(n))).toEqual([]);
  });

  it("every tool declares an inputSchema and a control-plane layer", () => {
    for (const tool of buildMcpTools()) {
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.layer).toMatch(/Layer [123]/);
    }
  });

  it("preflight_patch is labelled Law (dry-run), next_actions is the mutation hand-off", () => {
    expect(find("preflight_patch")!.layer).toMatch(/Law/);
    expect(find("preflight_patch")!.description).toMatch(/never writes workspace config|never applies/i);
    expect(find("next_actions")!.layer).toMatch(/Mutation/);
  });
});

describe("MCP handlers — truthful source & dry-run mode", () => {
  it("describe_workspace reports the true offline source", async () => {
    const ctx = await offlineCtx();
    const out = (await find("describe_workspace")!.handler(ctx as never, {})) as { source: string };
    expect(out.source).toBe("offline-config");
  });

  it("preflight_patch offline returns mode offline-approximation and never claims a write", async () => {
    const ctx = await offlineCtx();
    const out = (await find("preflight_patch")!.handler(ctx as never, { patch: { dataModel: { objects: [] } } })) as { mode: string };
    expect(out.mode).toBe("offline-approximation");
  });

  it("preflight_patch flags a field outside the allowlist", async () => {
    const ctx = await offlineCtx();
    const out = (await find("preflight_patch")!.handler(ctx as never, { patch: { pipelines: [] } })) as { allowlist: { ok: boolean; disallowed: string[] } };
    expect(out.allowlist.ok).toBe(false);
    expect(out.allowlist.disallowed).toContain("pipelines");
  });

  it("next_actions returns governed-call guidance, not a mutation", async () => {
    const ctx = await offlineCtx();
    const out = (await find("next_actions")!.handler(ctx as never, {})) as { boundary: string; actions: unknown[] };
    expect(out.boundary).toMatch(/There is no third mutation path/);
    expect(Array.isArray(out.actions)).toBe(true);
  });
});
