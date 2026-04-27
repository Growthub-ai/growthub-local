import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { createGrowthubBridgeClient } from "../runtime/growthub-bridge-client/index.js";
import type {
  BridgeAssetItem,
  BridgeBrandAsset,
  BridgeBrandKit,
  BridgeKnowledgeItem,
  BridgeKnowledgeTable,
  BridgeMcpAccount,
} from "@growthub/api-contract/bridge";

function printRows(rows: Array<Record<string, unknown>>, keys: string[]): void {
  for (const row of rows) {
    console.log(keys.map((key) => `${pc.dim(`${key}:`)} ${String(row[key] ?? "")}`).join("  "));
  }
}

function outPathFromStorage(storagePath: string, out?: string): string {
  return path.resolve(out?.trim() || path.basename(storagePath));
}

export function registerBridgeCommands(program: Command): void {
  const bridge = program
    .command("bridge")
    .description("Authenticated Growthub bridge resources: assets, knowledge, and MCP accounts.");

  const assets = bridge.command("assets").description("User asset gallery through the Growthub bridge.");

  assets
    .command("list")
    .description("List user-owned gallery assets.")
    .option("--page <page>", "Page number", (value) => Number(value), 1)
    .option("--limit <limit>", "Page size", (value) => Number(value), 20)
    .option("--source <source>", "Source filter")
    .option("--media-type <type>", "Media type filter")
    .option("--search <query>", "Filename/source search")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.listAssets({
        page: opts.page,
        limit: opts.limit,
        source: opts.source,
        mediaType: opts.mediaType,
        search: opts.search,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(pc.bold(`Growthub assets (${result.assets.length}/${result.pagination.total})`));
      printRows(result.assets.map((asset: BridgeAssetItem) => ({
        id: asset.id,
        type: asset.type,
        source: asset.source,
        storage: asset.storage_path,
      })), ["id", "type", "source", "storage"]);
    });

  assets
    .command("download")
    .description("Download a user-owned gallery asset by storage path.")
    .requiredOption("--storage-path <path>", "Asset storage path from bridge assets list")
    .option("--bucket <bucket>", "Storage bucket", "node_documents")
    .option("--out <path>", "Output file path")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const outPath = outPathFromStorage(opts.storagePath, opts.out);
      const bytes = await client.downloadStoragePath(opts.storagePath, outPath, opts.bucket);
      const payload = { success: true, storagePath: opts.storagePath, bucket: opts.bucket, outPath, bytes };
      if (opts.json) console.log(JSON.stringify(payload, null, 2));
      else console.log(`${pc.green("Downloaded")} ${outPath} (${bytes} bytes)`);
    });

  const brand = bridge.command("brand").description("User brand kits and brand assets through the Growthub bridge.");

  brand
    .command("kits")
    .description("List accessible remote brand kits.")
    .option("--include-assets", "Include each brand kit's assets")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.listBrandKits({ includeAssets: opts.includeAssets === true });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(pc.bold(`Growthub brand kits (${result.count})`));
      printRows(result.brandKits.map((kit: BridgeBrandKit) => ({
        id: kit.id,
        name: kit.brand_name,
        visibility: kit.visibility,
        assets: kit.assets?.length ?? "",
      })), ["id", "name", "visibility", "assets"]);
    });

  brand
    .command("assets")
    .description("List remote brand assets from accessible brand kits.")
    .option("--brand-kit-id <id>", "Filter by brand kit id")
    .option("--asset-type <type>", "Filter by asset type")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.listBrandAssets({ brandKitId: opts.brandKitId, assetType: opts.assetType });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(pc.bold(`Growthub brand assets (${result.count})`));
      printRows(result.assets.map((asset: BridgeBrandAsset) => ({
        id: asset.id,
        kit: asset.brand_kit_id,
        type: asset.asset_type,
        storage: asset.storage_path,
      })), ["id", "kit", "type", "storage"]);
    });

  brand
    .command("download")
    .description("Download a remote brand asset by storage path.")
    .requiredOption("--storage-path <path>", "Brand asset storage path from bridge brand assets")
    .option("--bucket <bucket>", "Storage bucket", "node_documents")
    .option("--out <path>", "Output file path")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const outPath = outPathFromStorage(opts.storagePath, opts.out);
      const bytes = await client.downloadStoragePath(opts.storagePath, outPath, opts.bucket);
      const payload = { success: true, storagePath: opts.storagePath, bucket: opts.bucket, outPath, bytes };
      if (opts.json) console.log(JSON.stringify(payload, null, 2));
      else console.log(`${pc.green("Downloaded")} ${outPath} (${bytes} bytes)`);
    });

  const knowledge = bridge.command("knowledge").description("User knowledge items through the Growthub bridge.");

  knowledge
    .command("tables")
    .description("List user-owned knowledge tables, the custom groupings for knowledge items.")
    .option("--origin <origin>", "Filter by metadata.origin")
    .option("--connector-type <type>", "Filter by metadata.connector_type")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.listKnowledgeTables({ origin: opts.origin, connectorType: opts.connectorType });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(pc.bold(`Growthub knowledge tables (${result.count})`));
      printRows(result.tables.map((table: BridgeKnowledgeTable) => ({
        id: table.id,
        file: table.file_name,
        origin: table.metadata?.origin,
        children: table.child_count ?? 0,
      })), ["id", "file", "origin", "children"]);
    });

  knowledge
    .command("list")
    .description("List user-owned knowledge items.")
    .option("--type <type>", "Knowledge source type")
    .option("--agent-slug <slug>", "Agent slug filter")
    .option("--table-id <id>", "Filter by metadata.table_id knowledge table grouping")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.listKnowledge({ type: opts.type, agentSlug: opts.agentSlug, tableId: opts.tableId });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(pc.bold(`Growthub knowledge (${result.count})`));
      printRows(result.items.map((item: BridgeKnowledgeItem) => ({
        id: item.id,
        file: item.file_name,
        type: item.source_type,
        storage: item.storage_path,
      })), ["id", "file", "type", "storage"]);
    });

  knowledge
    .command("write")
    .description("Create or update a markdown knowledge item.")
    .option("--id <id>", "Existing knowledge item id to update")
    .option("--title <title>", "Title for a new item")
    .option("--file-name <name>", "File name for an update")
    .option("--content <content>", "Markdown content for a new item")
    .option("--table-id <id>", "Attach new item to metadata.table_id knowledge table grouping")
    .option("--notes <notes>", "Notes metadata")
    .option("--agent-slug <slug>", "Agent slug", "growthub-cli")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.saveKnowledge({
        id: opts.id,
        title: opts.title,
        fileName: opts.fileName,
        content: opts.content,
        tableId: opts.tableId,
        notes: opts.notes,
        agentSlug: opts.agentSlug,
      });
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else console.log(result.success ? pc.green("Knowledge saved") : pc.red(result.error ?? "Knowledge save failed"));
    });

  knowledge
    .command("download")
    .description("Download a knowledge item by id.")
    .argument("<id>", "Knowledge item id")
    .requiredOption("--out <path>", "Output file path")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      const client = createGrowthubBridgeClient();
      const outPath = path.resolve(opts.out);
      const bytes = await client.downloadKnowledge(id, outPath);
      const payload = { success: true, id, outPath, bytes };
      if (opts.json) console.log(JSON.stringify(payload, null, 2));
      else console.log(`${pc.green("Downloaded")} ${outPath} (${bytes} bytes)`);
    });

  knowledge
    .command("delete")
    .description("Delete a knowledge item by id.")
    .argument("<id>", "Knowledge item id")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.deleteKnowledge(id);
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else console.log(result.success ? pc.green("Knowledge deleted") : pc.red(result.error ?? "Knowledge delete failed"));
    });

  knowledge
    .command("metadata")
    .description("Patch metadata for an existing knowledge item.")
    .argument("<id>", "Knowledge item id")
    .option("--table-id <id>", "Set metadata.table_id")
    .option("--notes <notes>", "Set metadata.notes")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.updateKnowledgeMetadata({ id, tableId: opts.tableId, notes: opts.notes });
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else console.log(result.success ? pc.green("Knowledge metadata updated") : pc.red(result.error ?? "Knowledge metadata update failed"));
    });

  bridge
    .command("run-sync")
    .description("Persist a local run output into the remote Growthub knowledge substrate.")
    .option("--run-id <id>", "Run id")
    .option("--title <title>", "Knowledge item title")
    .option("--output <json>", "JSON output payload")
    .option("--table-id <id>", "Attach to metadata.table_id")
    .option("--agent-slug <slug>", "Agent slug", "growthub_local_bridge")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const parsedOutput = opts.output ? JSON.parse(opts.output) : {};
      const result = await client.syncRunOutput({
        runId: opts.runId,
        title: opts.title,
        output: parsedOutput,
        tableId: opts.tableId,
        agentSlug: opts.agentSlug,
      });
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else console.log(result.success ? pc.green("Run output synced") : pc.red(result.error ?? "Run output sync failed"));
    });

  const mcp = bridge.command("mcp").description("MCP bridge accounts.");

  mcp
    .command("accounts")
    .description("List connected MCP accounts.")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.listMcpAccounts();
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(pc.bold(`Growthub MCP accounts (${result.accounts.length})`));
      printRows(result.accounts.map((account: BridgeMcpAccount) => ({
        id: account.id,
        provider: account.provider,
        app: account.appSlug,
        active: account.isActive,
      })), ["id", "provider", "app", "active"]);
    });
}
