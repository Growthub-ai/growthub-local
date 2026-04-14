import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { onboard } from "./commands/onboard.js";
import { doctor } from "./commands/doctor.js";
import { envCommand } from "./commands/env.js";
import { configure } from "./commands/configure.js";
import { addAllowedHostname } from "./commands/allowed-hostname.js";
import { heartbeatRun } from "./commands/heartbeat-run.js";
import { runCommand } from "./commands/run.js";
import { bootstrapCeoInvite } from "./commands/auth-bootstrap-ceo.js";
import { authLogin, authLogout, authWhoami } from "./commands/auth-login.js";
import { listHostedWorkflows } from "./auth/hosted-client.js";
import { registerProfileCommands } from "./commands/profile.js";
import { dbBackupCommand } from "./commands/db-backup.js";
import { registerContextCommands } from "./commands/client/context.js";
import { registerCompanyCommands } from "./commands/client/company.js";
import { registerIssueCommands } from "./commands/client/issue.js";
import { registerAgentCommands } from "./commands/client/agent.js";
import { registerApprovalCommands } from "./commands/client/approval.js";
import { registerActivityCommands } from "./commands/client/activity.js";
import { registerDashboardCommands } from "./commands/client/dashboard.js";
import { applyDataDirOverride, type DataDirOptionLike } from "./config/data-dir.js";
import { loadPaperclipEnvFile } from "./config/env.js";
import { initializeSurfaceRuntimeContract } from "./config/schema.js";
import { readConfig, resolveConfigPath } from "./config/store.js";
import { registerGtmCommands } from "./commands/gtm.js";
import { registerWorktreeCommands } from "./commands/worktree.js";
import { registerPluginCommands } from "./commands/client/plugin.js";
import { registerKitCommands, runInteractivePicker } from "./commands/kit.js";
import { registerTemplateCommands, runTemplatePicker } from "./commands/template.js";
import { registerCapabilityCommands, runCapabilityPicker } from "./commands/capability.js";
import { registerPipelineCommands, runPipelineAssembler } from "./commands/pipeline.js";
import { registerArtifactCommands } from "./commands/artifact.js";
import { registerWorkflowCommands, runWorkflowPicker } from "./commands/workflow.js";
import { getWorkflowAccess } from "./auth/workflow-access.js";
import { readSession, isSessionExpired } from "./auth/session-store.js";
import {
  createNativeIntelligenceBackend,
  createNativeIntelligenceProvider,
  checkBackendHealth,
  readIntelligenceConfig,
  writeIntelligenceConfig,
} from "./runtime/native-intelligence/index.js";
import type { NodeContractSummary } from "./runtime/cms-node-contracts/types.js";
import { createCmsCapabilityRegistryClient } from "./runtime/cms-capability-registry/index.js";
import { introspectNodeContract } from "./runtime/cms-node-contracts/index.js";
import type { WorkflowSummaryForIntelligence } from "./runtime/native-intelligence/index.js";
import { printPaperclipCliBanner } from "./utils/banner.js";
import { resolvePaperclipHomeDir } from "./config/home.js";
import type { SurfaceProfile } from "./config/schema.js";

const program = new Command();
const DATA_DIR_OPTION_HELP =
  "Growthub data directory root (isolates local instance state)";

type LocalSurfaceEntry = {
  instanceId: string;
  profile: "dx" | "gtm";
  configPath: string;
};

function resolveSurfaceProfile(config: unknown): SurfaceProfile | null {
  if (typeof config !== "object" || config === null) return null;
  const surface = (config as { surface?: unknown }).surface;
  if (typeof surface !== "object" || surface === null) return null;
  const profile = (surface as { profile?: unknown }).profile;
  return profile === "dx" || profile === "gtm" ? profile : null;
}

function resolveBootstrapOptions(argv: string[]): DataDirOptionLike {
  const options: DataDirOptionLike = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if ((value === "-c" || value === "--config") && argv[index + 1]) {
      options.config = argv[index + 1];
      index += 1;
      continue;
    }
    if ((value === "-d" || value === "--data-dir") && argv[index + 1]) {
      options.dataDir = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function registerSharedCommands(target: Command) {
  target
    .command("onboard")
    .description("Interactive first-run setup wizard")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("-y, --yes", "Accept defaults (quickstart + start immediately)", false)
    .option("--run", "Start Growthub immediately after saving config", false)
    .action(onboard);

  target
    .command("doctor")
    .description("Run diagnostic checks on your Growthub setup")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--repair", "Attempt to repair issues automatically")
    .alias("--fix")
    .option("-y, --yes", "Skip repair confirmation prompts")
    .action(async (opts) => {
      await doctor(opts);
    });

  target
    .command("env")
    .description("Print environment variables for deployment")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .action(envCommand);

  target
    .command("configure")
    .description("Update configuration sections")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("-s, --section <section>", "Section to configure (llm, database, logging, server, storage, secrets)")
    .action(configure);

  target
    .command("db:backup")
    .description("Create a one-off database backup using current config")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--dir <path>", "Backup output directory (overrides config)")
    .option("--retention-days <days>", "Retention window used for pruning", (value) => Number(value))
    .option("--filename-prefix <prefix>", "Backup filename prefix", "growthub")
    .option("--json", "Print backup metadata as JSON")
    .action(async (opts) => {
      await dbBackupCommand(opts);
    });

  target
    .command("allowed-hostname")
    .description("Allow a hostname for authenticated/private mode access")
    .argument("<host>", "Hostname to allow (for example dotta-macbook-pro)")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .action(addAllowedHostname);

  target
    .command("run")
    .description("Bootstrap local setup (onboard + doctor) and run Growthub")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("-i, --instance <id>", "Local instance id (default: default)")
    .option("--repair", "Attempt automatic repairs during doctor", true)
    .option("--no-repair", "Disable automatic repairs during doctor")
    .action(runCommand);

  target
    .command("discover")
    .description("Shared discovery entry for local app install, worker kits, and templates")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--run", "Start Growthub immediately after saving config", false)
    .action(async (opts) => {
      await runDiscoveryHub(opts);
    });

  registerKitCommands(target);
  registerTemplateCommands(target);
  registerCapabilityCommands(target);
  registerPipelineCommands(target);
  registerArtifactCommands(target);
  registerWorkflowCommands(target);

  const auth = target.command("auth").description("Authentication and bootstrap utilities");

  auth
    .command("bootstrap-ceo")
    .description("Create a one-time bootstrap invite URL for first instance admin")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--force", "Create new invite even if admin already exists", false)
    .option("--expires-hours <hours>", "Invite expiration window in hours", (value) => Number(value))
    .option("--base-url <url>", "Public base URL used to print invite link")
    .action(bootstrapCeoInvite);

  auth
    .command("login")
    .description("Sign in to hosted Growthub and save a CLI session (browser flow)")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--base-url <url>", "Hosted Growthub base URL (defaults to auth.growthubBaseUrl or GROWTHUB_BASE_URL)")
    .option("--token <token>", "Skip the browser flow by providing a pre-issued hosted token (scripting/CI)")
    .option("--machine-label <label>", "Label identifying this machine in the hosted app")
    .option("--workspace-label <label>", "Label identifying this workspace in the hosted app")
    .option("--timeout-ms <ms>", "How long to wait for the browser callback", (value) => Number(value))
    .option("--no-browser", "Do not try to launch a browser — print the URL and wait")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      await authLogin({
        ...opts,
        noBrowser: opts.browser === false,
      });
    });

  auth
    .command("logout")
    .description("Clear the hosted CLI session (local workspace profile is preserved)")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--keep-overlay", "Keep cached hosted overlay metadata; only drop the session token")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      await authLogout(opts);
    });

  auth
    .command("whoami")
    .description("Print the authenticated hosted identity and linked local workspace")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      await authWhoami(opts);
    });

  registerProfileCommands(target);
}

async function runHostedBridgeEntry(opts?: {
  config?: string;
  dataDir?: string;
}): Promise<void> {
  await authLogin({
    config: opts?.config,
    dataDir: opts?.dataDir,
  });
}

function isDiscoveryAuthenticated(): boolean {
  const session = readSession();
  if (!session) return false;
  return !isSessionExpired(session);
}

async function runNativeIntelligenceHub(): Promise<"back"> {
  while (true) {
    const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
    const currentConfig = readIntelligenceConfig();
    const recommendedModel = "gemma3:4b";
    const favoriteModel = currentConfig.localModel?.trim() || undefined;
    const defaultModel = currentConfig.localModel?.trim()
      || process.env.NATIVE_INTELLIGENCE_LOCAL_MODEL?.trim()
      || process.env.OLLAMA_MODEL?.trim()
      || recommendedModel;
    const status = await detectLocalIntelligenceStatus(baseUrl, defaultModel);

    const action = await p.select({
      message: "Local Intelligence",
      options: [
        { value: "setup", label: "Setup helper", hint: "machine detection + install/env guidance" },
        { value: "models", label: "Manage local custom models", hint: "select active favorite/default model" },
        { value: "prompt", label: "Prompt local model (chat flow)", hint: "human first local prompt submissions" },
        { value: "flows", label: "Run native-intelligence with your prompt", hint: "planner/normalizer/recommender/summarizer" },
        { value: "__back_to_hub", label: "← Back to main menu" },
      ],
    });

    if (p.isCancel(action) || action === "__back_to_hub") return "back";

    if (action === "setup") {
      const setupLines: string[] = [
        `OS: ${status.osLabel}`,
        `Ollama CLI: ${status.ollamaInstalled ? "detected" : "not detected"}`,
        `Ollama server: ${status.serverReachable ? "reachable" : "not reachable"} (${baseUrl})`,
        `Configured local model: ${defaultModel}`,
        `Model availability: ${status.modelAvailable ? "present" : "missing"}`,
        `Detected models: ${status.availableModels.length}`,
        "",
        ...buildSetupCommands(status.osLabel, baseUrl, recommendedModel),
      ];
      p.note(setupLines.join("\n"), "Local Intelligence Setup Helper");
      continue;
    }

    if (action === "models") {
      const modelOptions = [
        ...prioritizeModelOptions(status.availableModels, favoriteModel, recommendedModel).map((modelId) => ({
          value: modelId,
          label: modelId === favoriteModel ? `⭐ ${modelId}` : modelId,
          hint: modelId === favoriteModel
            ? "favorite local model"
            : modelId === recommendedModel
              ? "recommended (validated locally)"
              : "detected local model",
        })),
        { value: "__custom_model", label: "Enter custom local model id", hint: "for any other local adapter model" },
        { value: "__back_to_local_intel", label: "← Back to Local Intelligence" },
      ];
      const adapterChoice = await p.select({
        message: "Choose local custom model adapter",
        options: modelOptions,
      });
      if (p.isCancel(adapterChoice) || adapterChoice === "__back_to_local_intel") continue;

      const chosenModel = adapterChoice === "__custom_model"
        ? await promptForCustomModel(defaultModel)
        : adapterChoice;
      if (!chosenModel) continue;

      const applyConfirmed = await p.confirm({
        message: `Apply Local Intelligence config for model "${chosenModel}"?`,
        initialValue: true,
      });
      if (p.isCancel(applyConfirmed) || !applyConfirmed) continue;

      const applySpinner = p.spinner();
      applySpinner.start(`Applying model config (${chosenModel})...`);
      writeIntelligenceConfig({
        ...currentConfig,
        backendType: "local",
        modelId: inferCanonicalModelId(chosenModel),
        localModel: chosenModel,
        endpoint: `${baseUrl}/chat/completions`,
      });

      const health = await checkBackendHealth(readIntelligenceConfig());
      if (!health.available) {
        applySpinner.stop(`Config saved, backend unavailable (${health.latencyMs}ms).`);
        p.note(
          [...(health.error ? [`Error: ${health.error}`] : []), "You can still run prompt flow and retry health later."].join("\n"),
          "Local model status",
        );
        continue;
      }
      applySpinner.stop(`Config saved and backend reachable (${health.latencyMs}ms).`);
      continue;
    }

    if (action === "prompt") {
      await runLocalPromptChat(baseUrl, defaultModel);
      continue;
    }

    const customPrompt = await p.text({
      message: "Enter your local intelligence prompt",
      placeholder: "Describe what you want to create/analyze",
    });
    if (p.isCancel(customPrompt)) continue;
    const prompt = String(customPrompt).trim();
    if (!prompt) {
      p.note("Prompt was empty. Nothing was run.", "Local Intelligence");
      continue;
    }
    await runNativeIntelligenceFlowSuite(baseUrl, defaultModel, prompt);
  }
}

async function detectLocalIntelligenceStatus(baseUrl: string, model: string): Promise<{
  osLabel: string;
  ollamaInstalled: boolean;
  serverReachable: boolean;
  modelAvailable: boolean;
  availableModels: string[];
}> {
  const osLabel = process.platform === "darwin"
    ? "macOS"
    : process.platform === "win32"
      ? "Windows"
      : "Linux";
  const ollamaInstalled = spawnSync("ollama", ["--version"], { stdio: "ignore" }).status === 0;

  const modelsUrl = `${baseUrl}/models`;
  try {
    const response = await fetch(modelsUrl, { method: "GET" });
    if (!response.ok) {
      return { osLabel, ollamaInstalled, serverReachable: false, modelAvailable: false, availableModels: [] };
    }
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const ids = (data.data ?? []).map((entry) => entry.id ?? "");
    return {
      osLabel,
      ollamaInstalled,
      serverReachable: true,
      modelAvailable: ids.includes(model),
      availableModels: ids.filter((id) => id.length > 0),
    };
  } catch {
    return { osLabel, ollamaInstalled, serverReachable: false, modelAvailable: false, availableModels: [] };
  }
}

function buildSetupCommands(osLabel: string, baseUrl: string, recommendedModel: string): string[] {
  if (osLabel === "Windows") {
    return [
      "Quick setup (Windows):",
      "  1) Install Ollama from https://ollama.com/download/windows",
      "  2) Start Ollama app/service",
      `  3) Run: ollama pull ${recommendedModel}`,
      "  4) Optional env (PowerShell):",
      `     $env:OLLAMA_BASE_URL=\"${baseUrl}\"`,
      "     $env:NATIVE_INTELLIGENCE_LOCAL_MODEL=\"<your-model-id>\"",
    ];
  }

  return [
    "Quick setup (macOS/Linux):",
    "  1) brew install ollama",
    "  2) ollama serve &",
    `  3) ollama pull ${recommendedModel}`,
    `  4) export OLLAMA_BASE_URL=${baseUrl}`,
    "  5) export NATIVE_INTELLIGENCE_LOCAL_MODEL=<your-model-id>",
  ];
}

function prioritizeModelOptions(
  models: string[],
  favoriteModel?: string,
  recommendedModel?: string,
): string[] {
  const unique = [...new Set(models)];
  if (unique.length === 0) return unique;

  if (favoriteModel && unique.includes(favoriteModel)) {
    return [favoriteModel, ...unique.filter((id) => id !== favoriteModel)];
  }
  if (recommendedModel && unique.includes(recommendedModel)) {
    return [recommendedModel, ...unique.filter((id) => id !== recommendedModel)];
  }
  return unique;
}

async function promptForCustomModel(defaultModel: string): Promise<string | null> {
  const input = await p.text({
    message: "Enter local model id",
    placeholder: "example: gemma3:4b",
    defaultValue: defaultModel,
  });
  if (p.isCancel(input)) return null;
  const trimmed = String(input).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function inferCanonicalModelId(modelId: string): "gemma3" | "gemma3n" | "codegemma" {
  const lower = modelId.toLowerCase();
  if (lower.includes("gemma3n")) return "gemma3n";
  if (lower.includes("codegemma")) return "codegemma";
  return "gemma3";
}

async function runLocalPromptChat(baseUrl: string, defaultModel: string): Promise<void> {
  const activeModel = defaultModel;
  const thread = loadOrCreateLocalThread();
  const baseConfig = {
    ...readIntelligenceConfig(),
    backendType: "local" as const,
    modelId: inferCanonicalModelId(activeModel),
    localModel: activeModel,
    endpoint: `${baseUrl}/chat/completions`,
    // Local models can take 20-40s on first warmup.
    timeoutMs: Math.max(readIntelligenceConfig().timeoutMs ?? 30_000, 120_000),
  };
  const backend = createNativeIntelligenceBackend(baseConfig);

  p.note(
    [
      `Active local model: ${activeModel}`,
      `Thread: ${thread.id}`,
      `Saved at: ${thread.filePath}`,
      "Type your prompt and press Enter.",
      "Use '/back' to return to Local Intelligence menu.",
    ].join("\n"),
    "Local Prompt Flow",
  );

  while (true) {
    const rawPrompt = await p.text({
      message: `Prompt (${activeModel})`,
      placeholder: "Ask anything...",
    });
    if (p.isCancel(rawPrompt)) return;
    const prompt = String(rawPrompt).trim();
    if (prompt === "/back") return;
    if (prompt.length === 0) continue;

    const historyContext = renderHistoryContext(thread.messages, 8);
    const runSpinner = p.spinner();
    runSpinner.start("Invoking local model...");
    try {
      const out = await completeWithRetry(
        backend,
        baseConfig,
        {
        systemPrompt: "You are Growthub Local Intelligence. Be concise, direct, and useful.",
          userPrompt: historyContext.length > 0
            ? `Conversation so far:\n${historyContext}\n\nUser: ${prompt}`
            : prompt,
        responseFormat: "text",
        },
      );
      thread.messages.push({ role: "user", content: prompt, createdAt: new Date().toISOString() });
      thread.messages.push({ role: "assistant", content: out.text, createdAt: new Date().toISOString() });
      saveLocalThread(thread);
      runSpinner.stop(`Response received (${out.latencyMs}ms · ${out.modelId})`);
      console.log("");
      console.log(out.text);
      console.log("");
    } catch (err) {
      runSpinner.stop("Invocation failed.");
      p.note(err instanceof Error ? err.message : String(err), "Local model error");
    }
  }
}

type LocalThreadMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type LocalThread = {
  id: string;
  filePath: string;
  messages: LocalThreadMessage[];
};

function resolveLocalThreadsDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "native-intelligence", "threads");
}

function loadOrCreateLocalThread(): LocalThread {
  const dir = resolveLocalThreadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const activePath = path.resolve(dir, "active-thread.json");

  if (fs.existsSync(activePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(activePath, "utf-8")) as {
        id?: string;
        messages?: LocalThreadMessage[];
      };
      const id = typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : `thread-${Date.now()}`;
      const threadFile = path.resolve(dir, `${id}.json`);
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      return { id, filePath: threadFile, messages };
    } catch {
      // fall through to new thread
    }
  }

  const id = `thread-${Date.now()}`;
  const filePath = path.resolve(dir, `${id}.json`);
  const thread: LocalThread = { id, filePath, messages: [] };
  saveLocalThread(thread);
  return thread;
}

function saveLocalThread(thread: LocalThread): void {
  const dir = resolveLocalThreadsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    thread.filePath,
    `${JSON.stringify({ id: thread.id, messages: thread.messages }, null, 2)}\n`,
    "utf-8",
  );
  const activePath = path.resolve(dir, "active-thread.json");
  fs.writeFileSync(
    activePath,
    `${JSON.stringify({ id: thread.id, messages: thread.messages }, null, 2)}\n`,
    "utf-8",
  );
}

function renderHistoryContext(messages: LocalThreadMessage[], limit: number): string {
  return messages
    .slice(-limit)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n");
}

async function completeWithRetry(
  backend: ReturnType<typeof createNativeIntelligenceBackend>,
  baseConfig: {
    backendType: "local";
    modelId: "gemma3" | "gemma3n" | "codegemma";
    localModel: string;
    endpoint: string;
    timeoutMs: number;
  },
  input: {
    systemPrompt: string;
    userPrompt: string;
    responseFormat: "text";
  },
) {
  try {
    return await backend.complete(input);
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    if (!message.includes("aborted")) throw err;

    // Retry once with a longer timeout for cold-start model loads.
    const retryBackend = createNativeIntelligenceBackend({
      ...baseConfig,
      timeoutMs: Math.max(baseConfig.timeoutMs, 180_000),
    });
    return retryBackend.complete(input);
  }
}

async function runNativeIntelligenceFlowSuite(
  baseUrl: string,
  defaultModel: string,
  prompt: string,
): Promise<void> {
  const provider = createNativeIntelligenceProvider({
    backendType: "local",
    modelId: inferCanonicalModelId(defaultModel),
    localModel: defaultModel,
    endpoint: `${baseUrl}/chat/completions`,
  });

  try {
    const contracts = await loadRuntimeContracts();
    if (contracts.length === 0) {
      throw new Error("No runtime contracts available for local-intelligence flow run.");
    }
    const savedWorkflows = await loadRuntimeWorkflows();
    const primaryContract = contracts.find((contract) => contract.inputs.length > 0) ?? contracts[0];
    const rawBindings = await collectBindingsFromContract(primaryContract, prompt);
    const requiredOutputTypes = primaryContract.outputTypes.length > 0
      ? [primaryContract.outputTypes[0]]
      : undefined;
    const flowSpinner = p.spinner();
    flowSpinner.start("Running planner/normalizer/recommender/summarizer with your prompt...");

    const plan = await provider.planWorkflow({
      userIntent: prompt,
      availableContracts: contracts,
      executionMode: "hosted",
      constraints: { maxNodes: 3, requiredOutputTypes },
    });
    const normalized = await provider.normalizeBindings({
      nodeSlug: primaryContract.slug,
      contract: primaryContract,
      rawBindings,
      executionMode: "hosted",
    });
    const recommendation = await provider.recommendWorkflow({
      userIntent: prompt,
      savedWorkflows,
      availableContracts: contracts,
      executionMode: "hosted",
    });
    const summaryNodes = plan.proposedNodes.length > 0
      ? plan.proposedNodes.slice(0, 3).map((node) => {
          const contract = contracts.find((entry) => entry.slug === node.slug);
          return {
            slug: node.slug,
            bindingCount: 1,
            missingRequired: [] as string[],
            outputTypes: contract?.outputTypes ?? [],
            assetCount: 0,
          };
        })
      : [{
          slug: primaryContract.slug,
          bindingCount: Object.keys(rawBindings).length,
          missingRequired: normalized.missingRequired,
          outputTypes: primaryContract.outputTypes,
          assetCount: 0,
        }];
    const summary = await provider.summarizeExecution({
      pipeline: {
        pipelineId: "local-intel-flow-suite",
        executionMode: "hosted",
        nodes: summaryNodes,
        warnings: [],
      },
      registryContext: contracts,
      phase: "pre-execution",
    });
    flowSpinner.stop("Flow suite completed.");
    p.note(
      [
        `Prompt: ${prompt}`,
        `Planner nodes: ${plan.proposedNodes.map((n) => n.slug).join(", ")}`,
        `Normalizer contract: ${primaryContract.slug} (${normalized.fields.length} field updates)`,
        `Recommender strategy: ${recommendation.topRecommendation.strategy}`,
        `Summarizer title: ${summary.title}`,
      ].join("\n"),
      "Native Intelligence Flow Results",
    );
  } catch (err) {
    p.note(err instanceof Error ? err.message : String(err), "Flow error");
  }
}

async function loadRuntimeContracts(): Promise<NodeContractSummary[]> {
  const registry = createCmsCapabilityRegistryClient();
  const { nodes } = await registry.listCapabilities({ enabledOnly: false });
  return nodes.map((node) => introspectNodeContract(node));
}

async function loadRuntimeWorkflows(): Promise<WorkflowSummaryForIntelligence[]> {
  const session = readSession();
  if (!session || isSessionExpired(session)) return [];
  const response = await listHostedWorkflows(session);
  if (!response?.workflows) return [];

  return response.workflows.map((workflow) => ({
    workflowId: workflow.workflowId,
    name: workflow.name,
    description: workflow.description ?? undefined,
    nodeCount: workflow.latestVersion?.nodeCount ?? 0,
    nodeSlugs: [],
    label: null,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt ?? undefined,
    versionCount: workflow.versionCount ?? 1,
  }));
}

async function collectBindingsFromContract(
  contract: NodeContractSummary,
  promptSeed: string,
): Promise<Record<string, unknown>> {
  const bindings: Record<string, unknown> = {};

  for (const input of contract.inputs) {
    const defaultValue = input.key === "prompt"
      ? promptSeed
      : input.defaultValue !== undefined
        ? String(input.defaultValue)
        : "";

    const raw = await p.text({
      message: `${contract.slug} → ${input.key} (${input.type}${input.required ? ", required" : ""})`,
      placeholder: input.required
        ? `Enter ${input.key}`
        : `Optional: press Enter to skip ${input.key}`,
      defaultValue,
    });

    if (p.isCancel(raw)) {
      throw new Error("Cancelled while collecting contract input bindings.");
    }

    const value = String(raw).trim();
    if (!value && input.required) {
      throw new Error(`Required binding "${input.key}" was left empty.`);
    }
    if (!value) {
      continue;
    }
    bindings[input.key] = value;
  }

  return bindings;
}

async function runDiscoveryHub(opts?: {
  config?: string;
  dataDir?: string;
  run?: boolean;
}): Promise<void> {
  printPaperclipCliBanner();
  p.intro("Growthub Local");

  while (true) {
    const workflowAccess = getWorkflowAccess();
    const surfaceChoice = await p.select({
      message: "What do you want to do first?",
      options: [
        {
          value: "app",
          label: "📦 Full Local App",
          hint: "Work from existing app or build from scratch",
        },
        {
          value: "kits",
          label: "🧰 Worker Kits",
          hint: "Self-contained workspace environments for agents",
        },
        {
          value: "templates",
          label: "📚 Templates",
          hint: "Artifact template library",
        },
        {
          value: "workflows",
          label: workflowAccess.state === "ready"
            ? "🔗 Workflows"
            : "🔗 Workflows" + pc.dim(" (locked)"),
          hint: workflowAccess.state === "ready"
            ? "CMS contracts, dynamic pipelines, and saved workflows"
            : workflowAccess.reason,
        },
        {
          value: "native-intelligence",
          label: "🧠 Local Intelligence",
          hint: "use local custom models adapaters",
        },
        {
          value: "hosted-auth",
          label: "🔐 Connect Growthub Account",
          hint: "Attach this CLI to the hosted Growthub user through the canonical browser flow",
        },
        {
          value: "help",
          label: "❓ Help CLI",
          hint: "See the main commands and what each path does",
        },
      ],
    });

    if (p.isCancel(surfaceChoice)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (surfaceChoice === "help") {
      p.note(
        [
          "📦 Full Local App: open an existing local surface or create a new GTM/DX profile.",
          "🧰 Worker Kits: browse specialized agents and custom workspaces.",
          "📚 Templates: browse reusable artifact templates by library type.",
          "🔗 Workflows: browse CMS contracts, create dynamic pipelines, and manage saved workflows.",
          "🧠 Local Intelligence: use local custom models adapaters: inspect Gemma health, view intelligence tree, and run sample summary checks.",
          `   Locked state: ${workflowAccess.reason}.`,
          "🔐 Connect Growthub Account: open the canonical hosted auth flow for this CLI.",
          "",
          "Direct commands:",
          "growthub auth login",
          "growthub auth whoami",
          "growthub kit",
          "growthub template",
          "growthub workflow",
          "growthub capability list",
          "growthub pipeline assemble",
          "growthub artifact list",
        ].join("\n"),
        "Growthub CLI Help",
      );
      continue;
    }

    if (surfaceChoice === "app") {
      while (true) {
        const appModeChoice = await p.select({
          message: "How do you want to open Growthub Local?",
          options: [
            {
              value: "create",
              label: "🆕 Create New Profile",
              hint: "Build a new local app surface.",
            },
            {
              value: "load",
              label: "📂 Load Existing Profile",
              hint: "Work from a profile already on this machine.",
            },
            {
              value: "__back_to_hub",
              label: "← Back to main menu",
            },
          ],
        });

        if (p.isCancel(appModeChoice)) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        if (appModeChoice === "__back_to_hub") break;

        if (appModeChoice === "load") {
          const existingSurfaces = listLocalSurfaces();
          if (existingSurfaces.length === 0) {
            p.note("No existing local app profiles were found on this machine.", "Nothing found");
            continue;
          }

          const existingChoice = await p.select({
            message: "Select an existing app surface",
            options: [
              ...existingSurfaces.map((surface) => ({
                value: surface.instanceId,
                label: `${surface.profile === "gtm" ? "📈" : "🧠"} ${surface.profile.toUpperCase()} · ${surface.instanceId}`,
                hint: surface.configPath,
              })),
              { value: "__back_to_app_mode", label: "← Back to app options" },
            ],
          });

          if (p.isCancel(existingChoice)) {
            p.cancel("Cancelled.");
            process.exit(0);
          }
          if (existingChoice === "__back_to_app_mode") {
            continue;
          }

          const selectedSurface = existingSurfaces.find((surface) => surface.instanceId === existingChoice);
          if (!selectedSurface) {
            p.cancel("Selected profile not found.");
            process.exit(1);
          }

          process.env.PAPERCLIP_SURFACE_PROFILE = selectedSurface.profile;
          await runCommand({
            config: selectedSurface.configPath,
            instance: selectedSurface.instanceId,
            repair: true,
            yes: true,
          });
          return;
        }

        const profileChoice = await p.select({
          message: "Which new app surface do you want to create?",
          options: [
            {
              value: "gtm",
              label: "📈 GTM",
              hint: "Go-to-Market surface.",
            },
            {
              value: "dx",
              label: "🧠 DX",
              hint: "Developer Experience surface.",
            },
            {
              value: "__back_to_app_mode",
              label: "← Back to app options",
            },
          ],
        });

        if (p.isCancel(profileChoice)) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        if (profileChoice === "__back_to_app_mode") {
          continue;
        }

        process.env.PAPERCLIP_SURFACE_PROFILE = profileChoice;
        await onboard({
          config: opts?.config,
          run: opts?.run ?? isInstallerMode(),
          yes: isInstallerMode(),
        });
        return;
      }

      continue;
    }

    if (surfaceChoice === "kits") {
      const result = await runInteractivePicker({ allowBackToHub: true });
      if (result === "back") continue;
      return;
    }

    if (surfaceChoice === "workflows") {
      const result = await runWorkflowPicker({ allowBackToHub: true });
      if (result === "back") continue;
      return;
    }

    if (surfaceChoice === "native-intelligence") {
      const result = await runNativeIntelligenceHub();
      if (result === "back") continue;
      return;
    }

    if (surfaceChoice === "hosted-auth") {
      await runHostedBridgeEntry({ config: opts?.config, dataDir: opts?.dataDir });
      continue;
    }

    const result = await runTemplatePicker({ allowBackToHub: true });
    if (result === "back") continue;
    return;
  }
}

function isInstallerMode(): boolean {
  return process.env.GROWTHUB_INSTALLER_MODE === "true";
}

function listLocalSurfaces(): LocalSurfaceEntry[] {
  const homeDir = resolvePaperclipHomeDir();
  const instancesDir = path.resolve(homeDir, "instances");
  if (!fs.existsSync(instancesDir)) return [];

  return fs.readdirSync(instancesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const instanceId = entry.name;
      const configPath = path.resolve(instancesDir, instanceId, "config.json");
      if (!fs.existsSync(configPath)) return null;

      try {
        const config = readConfig(configPath);
        if (!config) return null;
        const profile = resolveSurfaceProfile(config);
        if (!profile) return null;
        return {
          instanceId,
          profile,
          configPath,
        } satisfies LocalSurfaceEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is LocalSurfaceEntry => entry !== null)
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
}

function registerDxCommands(target: Command) {
  const heartbeat = target.command("heartbeat").description("Heartbeat utilities");

  heartbeat
    .command("run")
    .description("Run one agent heartbeat and stream live logs")
    .requiredOption("-a, --agent-id <agentId>", "Agent ID to invoke")
    .option("-c, --config <path>", "Path to config file")
    .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
    .option("--context <path>", "Path to CLI context file")
    .option("--profile <name>", "CLI context profile name")
    .option("--api-base <url>", "Base URL for the Growthub server API")
    .option("--api-key <token>", "Bearer token for agent-authenticated calls")
    .option(
      "--source <source>",
      "Invocation source (timer | assignment | on_demand | automation)",
      "on_demand",
    )
    .option("--trigger <trigger>", "Trigger detail (manual | ping | callback | system)", "manual")
    .option("--timeout-ms <ms>", "Max time to wait before giving up", "0")
    .option("--json", "Output raw JSON where applicable")
    .option("--debug", "Show raw adapter stdout/stderr JSON chunks")
    .action(heartbeatRun);

  registerContextCommands(target);
  registerCompanyCommands(target);
  registerIssueCommands(target);
  registerAgentCommands(target);
  registerApprovalCommands(target);
  registerActivityCommands(target);
  registerDashboardCommands(target);
  registerWorktreeCommands(target);
  registerPluginCommands(target);
}

const bootstrapOptions = resolveBootstrapOptions(process.argv.slice(2));
applyDataDirOverride(bootstrapOptions, {
  hasConfigOption: bootstrapOptions.config !== undefined,
  hasContextOption: false,
});
loadPaperclipEnvFile(bootstrapOptions.config);
const bootstrapConfig = readConfig(resolveConfigPath(bootstrapOptions.config));
const surfaceRuntime = initializeSurfaceRuntimeContract(resolveSurfaceProfile(bootstrapConfig) ?? undefined);

program
  .name("growthub")
  .description("Growthub CLI — setup, configure, and run your local Growthub instance")
  .version("0.3.49")
  .addHelpText("after", `
Worker Kits (agent execution environments):

  Discovery:
    $ growthub kit                              Interactive browser — pick, preview, download
    $ growthub kit list                         All kits grouped by family (studio · workflow · operator · ops)
    $ growthub kit list --family studio         Filter by family
    $ growthub kit families                     Show family taxonomy with descriptions

  Download:
    $ growthub kit download                     Interactive (no arg = picker)
    $ growthub kit download higgsfield          Fuzzy slug — resolves automatically
    $ growthub kit download higgsfield --yes    Skip confirmation (scripting / agent use)
    $ growthub kit download growthub-open-higgsfield-studio-v1 --out ~/kits

  Inspect & validate:
    $ growthub kit inspect higgsfield-studio-v1
    $ growthub kit inspect growthub-email-marketing-v1 --json
    $ growthub kit validate ./path/to/kit

  After download:
    1. Point Growthub local (or Claude Code) Working Directory at the exported folder
    2. cp .env.example .env  →  add your API key
    3. Open a new session — the operator agent loads automatically

Instance setup:
    $ growthub onboard                          First-run interactive wizard
    $ growthub run                              Onboard + doctor + start server
    $ growthub doctor                           Diagnose and optionally repair
    $ growthub configure                        Update config sections
    $ growthub                                  Interactive discovery hub

Workflows (requires auth):
    $ growthub workflow                         Interactive workflow browser
    $ growthub workflow saved                   List saved workflow pipelines
    $ growthub pipeline assemble                Build and save hosted dynamic pipelines

Dynamic Registry Pipelines:

  Capabilities:
    $ growthub capability                       Interactive capability browser
    $ growthub capability list                  All capabilities grouped by family
    $ growthub capability list --family video   Filter by family
    $ growthub capability inspect video-gen     Inspect a specific capability
    $ growthub capability resolve               Resolve machine-scoped bindings

  Pipelines:
    $ growthub pipeline                         Interactive pipeline assembler
    $ growthub pipeline assemble                Interactive assembly
    $ growthub pipeline validate ./pipeline.json
    $ growthub pipeline execute ./pipeline.json

  Artifacts:
    $ growthub artifact list                    All pipeline artifacts
    $ growthub artifact list --type video       Filter by type
    $ growthub artifact inspect <id>            Inspect a specific artifact

Hosted account bridge:
    $ growthub auth login                       Sign in via the hosted app (browser flow)
    $ growthub auth whoami                      Show signed-in identity + linked local workspace
    $ growthub auth logout                      Clear the hosted session (local workspace preserved)
`);

program.action(async () => {
  await runDiscoveryHub();
});

program
  .command("list")
  .description("Open the interactive Growthub discovery hub")
  .action(async () => {
    await runDiscoveryHub();
  });

program.hook("preAction", (_thisCommand, actionCommand) => {
  const options = actionCommand.optsWithGlobals() as DataDirOptionLike;
  const optionNames = new Set(actionCommand.options.map((option) => option.attributeName()));
  applyDataDirOverride(options, {
    hasConfigOption: optionNames.has("config"),
    hasContextOption: optionNames.has("context"),
  });
  loadPaperclipEnvFile(options.config);
});

registerSharedCommands(program);
if (surfaceRuntime.capabilities.dxEnabled) {
  registerDxCommands(program);
} else {
  registerGtmCommands(program);
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
