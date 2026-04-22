/**
 * CLI Commands — chat
 *
 * Streaming-native conversational surface. Reuses:
 *   - `StreamingConsole` (renders + transcribes)
 *   - `createNativeIntelligenceBackend` / `streamWithBackend` (LLM calls)
 *   - `createCmsCapabilityRegistryClient` (slash commands bind against it)
 *
 * Slash commands (all available inside interactive mode):
 *   /help                       — list slash commands
 *   /registry                   — print a compact capability registry summary
 *   /plan <intent>              — run the native-intelligence planner
 *   /generate <family> <text>   — placeholder: prints the single-node pipeline
 *                                 that would be assembled for the request
 *   /exit                       — leave chat
 *
 * One-shot mode: `growthub chat "prompt"` runs a single turn and exits. The
 * transcript is persisted under `<forkPath>/.growthub-fork/sessions/<id>.jsonl`.
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import {
  createNativeIntelligenceBackend,
  readIntelligenceConfig,
  streamWithBackend,
  type ModelCompletionInput,
} from "../runtime/native-intelligence/index.js";
import {
  createCmsCapabilityRegistryClient,
  type CapabilityFamily,
} from "../runtime/cms-capability-registry/index.js";
import {
  createStreamingConsole,
  type StreamingConsoleHandle,
} from "../runtime/streaming-console/index.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

const SYSTEM_PROMPT =
  "You are Growthub Local Intelligence. You help operators reason about CMS nodes, pipelines, and generation workflows. Be concise, direct, and actionable.";

interface ChatCommandOptions {
  prompt?: string;
  sessionId?: string;
  forkPath?: string;
  silent?: boolean;
}

export async function runChat(opts: ChatCommandOptions): Promise<void> {
  const console_ = createStreamingConsole({
    sessionId: opts.sessionId,
    forkPath: opts.forkPath,
    silent: opts.silent,
  });

  if (!opts.silent) {
    printPaperclipCliBanner();
    p.intro(pc.bold("💬 Growthub Chat"));
    if (console_.transcriptPath) {
      console_.writeSystem(`Transcript: ${console_.transcriptPath}`);
    }
  }

  try {
    if (opts.prompt) {
      await runTurn(opts.prompt, console_);
      return;
    }

    while (true) {
      const next = await p.text({
        message: pc.cyan("chat"),
        placeholder: "Type a message or /help",
      });
      if (p.isCancel(next)) {
        p.cancel("Cancelled.");
        return;
      }
      const text = (next as string).trim();
      if (!text) continue;

      if (text === "/exit" || text === "/quit") {
        p.outro(pc.dim("Bye."));
        return;
      }

      if (text.startsWith("/")) {
        await handleSlashCommand(text, console_);
        continue;
      }

      await runTurn(text, console_);
    }
  } finally {
    console_.close();
  }
}

async function runTurn(userText: string, console_: StreamingConsoleHandle): Promise<void> {
  console_.writeUser(userText);

  const config = readIntelligenceConfig();
  const backend = createNativeIntelligenceBackend(config);

  const input: ModelCompletionInput = {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: userText,
  };

  try {
    const result = await streamWithBackend(backend, input, async (chunk) => {
      console_.writeAssistantChunk(chunk.text, { final: chunk.final });
    });
    console_.writeAssistantMessage({
      text: result.text,
      modelId: result.modelId,
      latencyMs: result.latencyMs,
      usage: result.usage,
    });
  } catch (err) {
    console_.writeError("Chat backend error", (err as Error).message);
  }
}

async function handleSlashCommand(text: string, console_: StreamingConsoleHandle): Promise<void> {
  const [cmd, ...rest] = text.slice(1).split(/\s+/);
  const arg = rest.join(" ").trim();

  if (cmd === "help") {
    console_.writeSystem([
      "slash commands:",
      "  /help                   — this list",
      "  /registry               — compact capability registry summary",
      "  /plan <intent>          — propose a pipeline for an intent",
      "  /generate <family> <…>  — preview the single-node pipeline for a family",
      "  /exit                   — leave chat",
    ].join("\n"));
    return;
  }

  if (cmd === "registry") {
    try {
      const registry = createCmsCapabilityRegistryClient();
      const { nodes, meta } = await registry.listCapabilities({ enabledOnly: false });
      const byFamily = nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.family] = (acc[node.family] ?? 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(byFamily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([family, count]) => `${family}:${count}`)
        .join("  ");
      console_.writeSystem(`registry · ${nodes.length} nodes (${meta.cached ? "cached" : "fresh"}) · ${summary}`);
    } catch (err) {
      console_.writeError("Registry unavailable", (err as Error).message);
    }
    return;
  }

  if (cmd === "plan") {
    if (!arg) {
      console_.writeSystem("usage: /plan <intent>");
      return;
    }
    const { planWorkflow, createNativeIntelligenceBackend: makeBackend, readIntelligenceConfig: readCfg } = await import("../runtime/native-intelligence/index.js");
    const { introspectNodeContract } = await import("../runtime/cms-node-contracts/index.js");
    try {
      const registry = createCmsCapabilityRegistryClient();
      const { nodes } = await registry.listCapabilities({ enabledOnly: false });
      const contracts = nodes.map((n) => introspectNodeContract(n));
      const backend = makeBackend(readCfg());
      const plan = await planWorkflow({ userIntent: arg, availableContracts: contracts }, backend);
      console_.writeAssistantMessage({
        text: [
          `planner confidence: ${(plan.confidence * 100).toFixed(0)}%`,
          "proposed nodes:",
          ...plan.proposedNodes.map((n) => `  - ${n.slug} — ${n.reason}`),
          "",
          plan.explanation,
        ].join("\n"),
      });
    } catch (err) {
      console_.writeError("Planner error", (err as Error).message);
    }
    return;
  }

  if (cmd === "generate") {
    if (!arg) {
      console_.writeSystem("usage: /generate <family> <prompt>");
      return;
    }
    const [familyRaw, ...promptParts] = arg.split(/\s+/);
    const family = familyRaw as CapabilityFamily;
    const prompt = promptParts.join(" ");
    try {
      const registry = createCmsCapabilityRegistryClient();
      const { nodes } = await registry.listCapabilities({ family, enabledOnly: true });
      const pick = nodes[0];
      if (!pick) {
        console_.writeSystem(`no enabled capability found in family "${family}".`);
        return;
      }
      console_.writeAssistantMessage({
        text: [
          `would assemble a single-node pipeline:`,
          `  slug:     ${pick.slug}`,
          `  family:   ${pick.family}`,
          `  bindings: ${pick.requiredBindings.join(", ") || "(none)"}`,
          `  prompt:   ${prompt}`,
          "",
          "to execute: growthub pipeline assemble (interactive) or POST /api/execute-workflow.",
        ].join("\n"),
      });
    } catch (err) {
      console_.writeError("Registry error", (err as Error).message);
    }
    return;
  }

  console_.writeSystem(`unknown slash command: /${cmd}. type /help.`);
}

export function registerChatCommands(program: Command): void {
  program
    .command("chat")
    .description("Streaming chat surface backed by the native intelligence + CMS registry")
    .argument("[prompt]", "Optional one-shot prompt")
    .option("--session <id>", "Persist transcript under the given session id")
    .option("--fork <path>", "Use the given fork path for transcript persistence")
    .option("--silent", "Suppress stdout rendering (JSONL to transcript only)")
    .action(async (prompt: string | undefined, opts: { session?: string; fork?: string; silent?: boolean }) => {
      await runChat({
        prompt,
        sessionId: opts.session,
        forkPath: opts.fork,
        silent: opts.silent,
      });
    });
}
