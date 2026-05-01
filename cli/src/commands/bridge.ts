import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { createGrowthubBridgeClient } from "../runtime/growthub-bridge-client/index.js";
import type {
  BridgeAssetItem,
  BridgeBrandAsset,
  BridgeBrandKit,
  BridgeHostedAgentDiagnostics,
  BridgeHostedAgentManifest,
  BridgeHostedAgentWorkspaceBinding,
  BridgeHostedAgentWorkspaceBindingResponse,
  BridgeHostedAgentWorkspaceBindingsResponse,
  BridgeKnowledgeItem,
  BridgeKnowledgeTable,
  BridgeMcpAccount,
} from "@growthub/api-contract/bridge";
import { listKitForkRegistrations } from "../kits/fork-registry.js";
import type { KitForkRegistration } from "../kits/fork-types.js";

function printRows(rows: Array<Record<string, unknown>>, keys: string[]): void {
  for (const row of rows) {
    console.log(keys.map((key) => `${pc.dim(`${key}:`)} ${String(row[key] ?? "")}`).join("  "));
  }
}

function outPathFromStorage(storagePath: string, out?: string): string {
  return path.resolve(out?.trim() || path.basename(storagePath));
}

function formatList(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).join(", ") : "";
}

function sourceStatus(diagnostics: BridgeHostedAgentDiagnostics | undefined, source: "kv" | "cms"): string {
  return String(diagnostics?.[source]?.status ?? diagnostics?.sources?.[source]?.status ?? "");
}

export function agentLabel(agent: BridgeHostedAgentManifest): string {
  return agent.name ?? agent.agentName ?? agent.title ?? agent.agentSlug ?? agent.slug ?? "";
}

export function agentSlug(agent: BridgeHostedAgentManifest): string {
  return agent.slug ?? agent.agentSlug ?? "";
}

function bindingFileSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveBindingWorkspace(input: {
  forkId?: string;
  workspacePath?: string;
  allowLocal?: boolean;
}): { workspacePath: string; registration: KitForkRegistration | null; enterpriseReady: boolean } {
  const forks = listKitForkRegistrations();
  if (input.forkId) {
    const registration = forks.find((fork) => fork.forkId === input.forkId);
    if (!registration) {
      throw new Error(`Fork-sync workspace not found: ${input.forkId}. Run 'growthub kit fork list'.`);
    }
    return { workspacePath: registration.forkPath, registration, enterpriseReady: true };
  }

  const workspacePath = path.resolve(input.workspacePath ?? process.cwd());
  const registration = forks.find((fork) => path.resolve(fork.forkPath) === workspacePath) ?? null;
  if (registration) return { workspacePath, registration, enterpriseReady: true };
  if (!input.allowLocal) {
    throw new Error(
      `Workspace is not registered with fork-sync: ${workspacePath}. Use --fork-id for a governed workspace, or pass --allow-local for a local-only binding.`,
    );
  }
  return { workspacePath, registration: null, enterpriseReady: false };
}

function resolveAgentsDir(workspacePath: string): string {
  return path.resolve(workspacePath, ".growthub-fork", "agents");
}

function bindingPathFor(workspacePath: string, slug: string): string {
  const safeSlug = bindingFileSlug(slug);
  if (!safeSlug) throw new Error(`Invalid hosted agent slug: ${slug}`);
  return path.resolve(resolveAgentsDir(workspacePath), `${safeSlug}.json`);
}

export function listHostedAgentBindings(input: {
  forkId?: string;
  workspacePath?: string;
  allowLocal?: boolean;
}): BridgeHostedAgentWorkspaceBindingsResponse {
  const resolved = resolveBindingWorkspace(input);
  const forkStateDir = path.resolve(resolved.workspacePath, ".growthub-fork");
  if (!fs.existsSync(forkStateDir)) {
    throw new Error(`Governed workspace state not found at ${forkStateDir}.`);
  }
  const agentsDir = resolveAgentsDir(resolved.workspacePath);
  const files = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter((file) => file.endsWith(".json"))
    : [];
  const bindings = files.flatMap((file) => {
    const bindingPath = path.resolve(agentsDir, file);
    try {
      const parsed = JSON.parse(fs.readFileSync(bindingPath, "utf8")) as Partial<BridgeHostedAgentWorkspaceBinding>;
      if (!parsed.agentSlug) return [];
      return [{
        agentSlug: parsed.agentSlug,
        agentName: parsed.agentName,
        bindingPath,
        executionAuthority: "gh-app" as const,
        localExecution: false as const,
        forkSyncRegistered: resolved.enterpriseReady,
        remoteSyncConfigured: Boolean(resolved.registration?.remote),
        boundAt: parsed.boundAt,
      }];
    } catch {
      return [];
    }
  });
  return {
    success: true,
    forkId: resolved.registration?.forkId,
    workspacePath: resolved.workspacePath,
    bindings,
    count: bindings.length,
  };
}

export function removeHostedAgentBinding(input: {
  agentSlug: string;
  forkId?: string;
  workspacePath?: string;
  allowLocal?: boolean;
}): { success: boolean; agentSlug: string; bindingPath: string; removed: boolean } {
  const resolved = resolveBindingWorkspace(input);
  const bindingPath = bindingPathFor(resolved.workspacePath, input.agentSlug);
  const removed = fs.existsSync(bindingPath);
  if (removed) fs.rmSync(bindingPath, { force: true });
  return { success: true, agentSlug: input.agentSlug, bindingPath, removed };
}

export function writeHostedAgentBinding(input: {
  forkId?: string;
  workspacePath?: string;
  allowLocal?: boolean;
  requestedSlug: string;
  agent: BridgeHostedAgentManifest;
  diagnostics?: BridgeHostedAgentDiagnostics;
  warnings?: string[];
  resolvedSlug?: string;
}): { bindingPath: string; binding: BridgeHostedAgentWorkspaceBinding } {
  const resolved = resolveBindingWorkspace(input);
  const workspacePath = resolved.workspacePath;
  const forkStateDir = path.resolve(workspacePath, ".growthub-fork");
  if (!fs.existsSync(forkStateDir)) {
    throw new Error(`Governed workspace state not found at ${forkStateDir}.`);
  }

  const slug = agentSlug(input.agent) || input.resolvedSlug || input.requestedSlug;
  const agentsDir = resolveAgentsDir(workspacePath);
  fs.mkdirSync(agentsDir, { recursive: true });

  const binding: BridgeHostedAgentWorkspaceBinding = {
    version: 1,
    kind: "growthub-governed-workspace-agent-binding",
    agentSlug: slug,
    requestedSlug: input.requestedSlug,
    resolvedSlug: input.resolvedSlug ?? input.agent.resolvedSlug ?? slug,
    agentName: agentLabel(input.agent),
    forkId: resolved.registration?.forkId ?? null,
    kitId: resolved.registration?.kitId ?? null,
    workspacePath,
    forkSyncRegistered: resolved.enterpriseReady,
    remoteSyncConfigured: Boolean(resolved.registration?.remote),
    source: "growthub-bridge",
    executionAuthority: "gh-app",
    localExecution: false,
    boundAt: new Date().toISOString(),
    diagnostics: input.diagnostics ?? input.agent.diagnostics,
    warnings: input.warnings ?? input.agent.warnings ?? [],
    manifest: input.agent,
  };
  const bindingPath = bindingPathFor(workspacePath, slug);
  fs.writeFileSync(bindingPath, `${JSON.stringify(binding, null, 2)}\n`, "utf8");
  return { bindingPath, binding };
}

export function registerBridgeCommands(program: Command): void {
  const bridge = program
    .command("bridge")
    .description("Authenticated Growthub bridge resources: agents, assets, knowledge, and MCP accounts.");

  const agents = bridge.command("agents").description("Governed workspace agents through the authenticated Growthub bridge.");

  agents
    .command("list")
    .description("List agents available to governed workspaces.")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.listHostedAgentManifests();
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(pc.bold(`Growthub hosted agents (${result.count ?? result.agents.length})`));
      printRows(result.agents.map((agent: BridgeHostedAgentManifest) => ({
        slug: agentSlug(agent),
        resolved: agent.resolvedSlug ?? "",
        name: agentLabel(agent),
        source: agent.source ?? "",
        status: agent.status ?? "",
        kv: sourceStatus(agent.diagnostics ?? result.diagnostics, "kv"),
        cms: sourceStatus(agent.diagnostics ?? result.diagnostics, "cms"),
        warnings: formatList(agent.warnings),
      })), ["slug", "resolved", "name", "source", "status", "kv", "cms", "warnings"]);
      if (result.resolvedSlugs?.length) console.log(`${pc.dim("resolvedSlugs:")} ${result.resolvedSlugs.join(", ")}`);
      if (result.warnings?.length) console.log(`${pc.yellow("warnings:")} ${result.warnings.join("; ")}`);
    });

  agents
    .command("inspect")
    .description("Inspect one governed workspace agent manifest.")
    .argument("<slug>", "Hosted agent slug")
    .option("--json", "Output raw JSON")
    .action(async (slug, opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.inspectHostedAgentManifest(slug);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      const agent = result.agent ?? result.manifest;
      if (!agent) {
        console.log(pc.red("Hosted agent manifest not found."));
        return;
      }
      console.log(pc.bold(`Growthub hosted agent: ${agentLabel(agent)}`));
      printRows([{
        slug: agentSlug(agent),
        resolved: result.resolvedSlug ?? agent.resolvedSlug ?? "",
        source: agent.source ?? "",
        status: agent.status ?? "",
        kv: sourceStatus(agent.diagnostics ?? result.diagnostics, "kv"),
        cms: sourceStatus(agent.diagnostics ?? result.diagnostics, "cms"),
        warnings: formatList(agent.warnings ?? result.warnings),
      }], ["slug", "resolved", "source", "status", "kv", "cms", "warnings"]);
    });

  agents
    .command("bind")
    .description("Attach one agent to a fork-sync governed workspace without executing it.")
    .argument("<slug>", "Hosted agent slug")
    .option("--fork-id <id>", "Registered fork-sync workspace id from `growthub kit fork list`")
    .option("--workspace <path>", "Governed workspace path")
    .option("--allow-local", "Allow binding to an unregistered local-only .growthub-fork workspace")
    .option("--json", "Output raw JSON")
    .action(async (slug, opts) => {
      const client = createGrowthubBridgeClient();
      const result = await client.inspectHostedAgentManifest(slug);
      const agent = result.agent ?? result.manifest;
      if (!agent) {
        throw new Error(`Hosted agent manifest not found for slug: ${slug}`);
      }
      const written = writeHostedAgentBinding({
        forkId: opts.forkId,
        workspacePath: opts.workspace,
        allowLocal: opts.allowLocal === true,
        requestedSlug: slug,
        agent,
        diagnostics: result.diagnostics,
        warnings: result.warnings,
        resolvedSlug: result.resolvedSlug,
      });
      const payload: BridgeHostedAgentWorkspaceBindingResponse = {
        success: true,
        agentSlug: agentSlug(agent),
        bindingPath: written.bindingPath,
        binding: written.binding,
      };
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      console.log(`${pc.green("Bound")} ${payload.agentSlug} ${pc.dim("->")} ${written.bindingPath}`);
      console.log(pc.dim(`Fork-sync registered: ${String(written.binding.forkSyncRegistered)}; remote sync configured: ${String(written.binding.remoteSyncConfigured)}`));
      console.log(pc.dim("Execution remains hosted in gh-app; no agent was executed locally."));
    });

  agents
    .command("bindings")
    .description("List governed workspace agent bindings for a fork-sync workspace.")
    .option("--fork-id <id>", "Registered fork-sync workspace id from `growthub kit fork list`")
    .option("--workspace <path>", "Governed workspace path")
    .option("--allow-local", "Allow listing an unregistered local-only .growthub-fork workspace")
    .option("--json", "Output raw JSON")
    .action((opts) => {
      const result = listHostedAgentBindings({
        forkId: opts.forkId,
        workspacePath: opts.workspace,
        allowLocal: opts.allowLocal === true,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(pc.bold(`Governed workspace agent bindings (${result.count})`));
      printRows(result.bindings.map((binding) => ({
        slug: binding.agentSlug,
        name: binding.agentName ?? "",
        forkSync: binding.forkSyncRegistered,
        remote: binding.remoteSyncConfigured,
        path: binding.bindingPath,
      })), ["slug", "name", "forkSync", "remote", "path"]);
    });

  agents
    .command("unbind")
    .description("Remove one governed workspace agent binding without touching the hosted agent.")
    .argument("<slug>", "Hosted agent slug")
    .option("--fork-id <id>", "Registered fork-sync workspace id from `growthub kit fork list`")
    .option("--workspace <path>", "Governed workspace path")
    .option("--allow-local", "Allow unbinding from an unregistered local-only .growthub-fork workspace")
    .option("--json", "Output raw JSON")
    .action((slug, opts) => {
      const result = removeHostedAgentBinding({
        agentSlug: slug,
        forkId: opts.forkId,
        workspacePath: opts.workspace,
        allowLocal: opts.allowLocal === true,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(result.removed
        ? `${pc.green("Unbound")} ${slug} ${pc.dim(result.bindingPath)}`
        : `${pc.yellow("No binding found")} ${slug} ${pc.dim(result.bindingPath)}`);
    });

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
