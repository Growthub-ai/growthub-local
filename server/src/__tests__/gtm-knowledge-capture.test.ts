import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createKnowledgeItemFromImport, bindKnowledgeTable } from "../services/gtm-knowledge-capture.js";
import { readGtmState } from "../services/gtm-state.js";

const previousHome = process.env.PAPERCLIP_HOME;
const tempDirs: string[] = [];

afterEach(() => {
  process.env.PAPERCLIP_HOME = previousHome;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function useTempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-knowledge-capture-"));
  tempDirs.push(dir);
  process.env.PAPERCLIP_HOME = dir;
  return dir;
}

describe("gtm knowledge capture imports", () => {
  it("creates a knowledge item in GTM state with pending sync metadata when bound table is provided", () => {
    useTempHome();
    const item = createKnowledgeItemFromImport({
      name: "ICP Notes",
      description: "Draft notes",
      body: "## Notes",
      source: "paste",
      binding: {
        tableId: "tbl_123",
        tableName: "customer_research",
      },
    });

    expect(item.metadata.table_id).toBe("tbl_123");
    expect(item.metadata.table_name).toBe("customer_research");
    expect(item.metadata.sync_status).toBe("pending");

    const state = readGtmState();
    expect(state.knowledge.items[0]?.id).toBe(item.id);
  });

  it("binds the workspace knowledge table and marks it synced", () => {
    useTempHome();
    const table = bindKnowledgeTable({
      tableId: "tbl_live",
      tableName: "live_table",
      workspaceId: "ws_1",
      adminId: "admin_1",
      connectorType: "growthub",
    });

    expect(table.metadata.table_id).toBe("tbl_live");
    expect(table.metadata.table_name).toBe("live_table");
    expect(table.metadata.sync_status).toBe("synced");
    expect(table.metadata.workspace_id).toBe("ws_1");
  });
});
