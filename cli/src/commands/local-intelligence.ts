/**
 * CLI Commands — local-intelligence
 *
 * Top-level Commander surface for the catalog-backed Native Intelligence layer.
 *
 *   growthub local-intelligence list-variants   # catalog table
 *   growthub local-intelligence active          # current active model
 *   growthub local-intelligence use <id>        # set active model
 *   growthub local-intelligence health          # backend reachability
 *   growthub local-intelligence setup [id]      # per-family setup guidance
 *   growthub local-intelligence serve <id>      # print/start local adapter
 *
 * This is a thin wrapper around the catalog helpers in
 * `runtime/native-intelligence/index.ts`. The interactive discovery hub in
 * `cli/src/index.ts` remains canonical; this surface exists for scripting.
 */

import { spawn, spawnSync } from "node:child_process";
import { Command } from "commander";
import pc from "picocolors";
import {
  checkBackendHealth,
  getActiveModel,
  getBackendConfig,
  getLocalModelVariant,
  inferFamilyFromModelId,
  listLocalModelVariants,
  readIntelligenceConfig,
  writeIntelligenceConfig,
  type LocalModelVariant,
} from "../runtime/native-intelligence/index.js";

export function registerLocalIntelligenceCommands(program: Command): void {
  const li = program
    .command("local-intelligence")
    .description("Catalog-backed native intelligence — list variants, switch active model, health, setup");

  li.command("list-variants")
    .description("Print the model catalog as a table")
    .option("--json", "Emit machine-readable JSON instead of a table")
    .action((opts: { json?: boolean }) => {
      const variants = listLocalModelVariants();
      if (opts.json) {
        console.log(JSON.stringify(variants, null, 2));
        return;
      }
      printVariantTable(variants);
    });

  li.command("active")
    .description("Print the currently active local model and resolution source")
    .option("--json", "Emit machine-readable JSON")
    .action((opts: { json?: boolean }) => {
      const active = getActiveModel();
      if (opts.json) {
        console.log(JSON.stringify(active, null, 2));
        return;
      }
      console.log(`id:      ${active.id}`);
      console.log(`source:  ${active.source}`);
      if (active.variant) {
        console.log(`family:  ${active.variant.family}`);
        console.log(`display: ${active.variant.displayName}`);
        console.log(`context: ${active.variant.contextLength}`);
      } else {
        console.log(`family:  ${inferFamilyFromModelId(active.id)} (custom / not in catalog)`);
      }
    });

  li.command("use")
    .description("Set the active local model id (writes native-intelligence config)")
    .argument("<model-id>", "Catalog id (e.g. gemma3:4b, qwen3.5-coder-32b) or any custom adapter tag")
    .action((modelId: string) => {
      const trimmed = modelId.trim();
      if (!trimmed) {
        console.error("Model id is required.");
        process.exit(1);
      }
      const variant = getLocalModelVariant(trimmed);
      const family = variant?.family ?? inferFamilyFromModelId(trimmed);
      const backend = getBackendConfig(trimmed);
      const current = readIntelligenceConfig();
      writeIntelligenceConfig({
        ...current,
        backendType: "local",
        modelId: family,
        localModel: trimmed,
        endpoint: backend.chatCompletionsUrl,
        providerType: "local",
      });
      console.log(`Active model set: ${trimmed} (family=${family})`);
      console.log(`Endpoint: ${backend.chatCompletionsUrl} (${backend.source})`);
    });

  li.command("health")
    .description("Check backend reachability for the active model")
    .option("--json", "Emit machine-readable JSON")
    .action(async (opts: { json?: boolean }) => {
      const config = readIntelligenceConfig();
      const result = await checkBackendHealth(config);
      if (opts.json) {
        console.log(JSON.stringify({ ...result, endpoint: config.endpoint }, null, 2));
        return;
      }
      console.log(`Endpoint: ${config.endpoint}`);
      console.log(`Available: ${result.available}`);
      console.log(`Latency:   ${result.latencyMs}ms`);
      if (result.error) console.log(`Error:     ${result.error}`);
      process.exit(result.available ? 0 : 1);
    });

  li.command("setup")
    .description("Print per-family setup guidance for a model")
    .argument("[model-id]", "Catalog id (defaults to the active model)")
    .action((modelId?: string) => {
      const resolved = (modelId ?? getActiveModel().id).trim();
      const variant = getLocalModelVariant(resolved);
      const family = variant?.family ?? inferFamilyFromModelId(resolved);
      const backend = getBackendConfig(resolved);

      console.log(pc.bold(`Setup — ${variant?.displayName ?? resolved}`));
      console.log(`family:   ${family}`);
      console.log(`endpoint: ${backend.chatCompletionsUrl} (${backend.source})`);
      if (variant) {
        console.log(`context:  ${variant.contextLength}`);
        console.log(`quant:    ${variant.recommendedQuant}`);
        console.log(`hardware: ${variant.hardwareHint}`);
        if (variant.hfRepoId) console.log(`hf-repo:  ${variant.hfRepoId}`);
        if (variant.ollamaTag) console.log(`ollama:   ollama pull ${variant.ollamaTag}`);
        if (variant.defaultEndpointEnv) {
          console.log(`env:      ${variant.defaultEndpointEnv}=${backend.baseUrl}`);
        }
      } else {
        console.log("note:     not in catalog — treated as custom adapter tag.");
      }
    });

  li.command("serve")
    .description("Launch the local adapter runtime for a model (shells out to ollama)")
    .argument("[model-id]", "Catalog id (defaults to the active model)")
    .option("--dry-run", "Print the command that would be executed instead of running it")
    .action((modelId: string | undefined, opts: { dryRun?: boolean }) => {
      const resolved = (modelId ?? getActiveModel().id).trim();
      const variant = getLocalModelVariant(resolved);
      const tag = variant?.ollamaTag ?? resolved;
      const args = ["run", tag];
      if (opts.dryRun) {
        console.log(`ollama ${args.join(" ")}`);
        return;
      }
      const probe = spawnSync("ollama", ["--version"], { stdio: "ignore" });
      if (probe.status !== 0) {
        console.error("ollama binary not found. Run `growthub local-intelligence setup ${resolved}` for install guidance.");
        process.exit(127);
      }
      const child = spawn("ollama", args, { stdio: "inherit" });
      child.on("exit", (code) => process.exit(code ?? 0));
    });
}

function printVariantTable(variants: LocalModelVariant[]): void {
  const rows = variants.map((v) => ({
    id: v.id,
    family: v.family,
    ctx: String(v.contextLength),
    quant: v.recommendedQuant,
    hw: v.hardwareHint,
    hf: v.hfRepoId ?? "",
  }));
  const widths = {
    id: Math.max(2, ...rows.map((r) => r.id.length)),
    family: Math.max(6, ...rows.map((r) => r.family.length)),
    ctx: Math.max(3, ...rows.map((r) => r.ctx.length)),
    quant: Math.max(5, ...rows.map((r) => r.quant.length)),
    hw: Math.max(8, ...rows.map((r) => r.hw.length)),
    hf: Math.max(2, ...rows.map((r) => r.hf.length)),
  };
  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  const header = `${pad("id", widths.id)}  ${pad("family", widths.family)}  ${pad("ctx", widths.ctx)}  ${pad("quant", widths.quant)}  ${pad("hardware", widths.hw)}  ${pad("hf-repo", widths.hf)}`;
  console.log(pc.bold(header));
  console.log("-".repeat(header.length));
  for (const r of rows) {
    console.log(`${pad(r.id, widths.id)}  ${pad(r.family, widths.family)}  ${pad(r.ctx, widths.ctx)}  ${pad(r.quant, widths.quant)}  ${pad(r.hw, widths.hw)}  ${pad(r.hf, widths.hf)}`);
  }
}
