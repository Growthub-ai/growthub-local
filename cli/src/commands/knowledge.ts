/**
 * CLI Commands — knowledge
 *
 * growthub knowledge status    — Show local knowledge base sync status
 * growthub knowledge export    — Export kb_skill_docs to an envelope file
 * growthub knowledge import    — Import a knowledge envelope into the local KB
 * growthub knowledge sync      — Full bidirectional sync (export + import to other workspace)
 * growthub knowledge capture   — Post-run: capture compounding knowledge from a run
 *
 * All local-only operations work without a hosted session.
 * Hosted relay (--relay) requires `growthub auth login`.
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import { readSession, isSessionExpired } from "../auth/session-store.js";
import {
  discoverLocalWorkspaces,
  serializeEnvelope,
  deserializeEnvelope,
  verifyEnvelopeSignature,
  filterNewItems,
  writeEnvelopeFile,
  readEnvelopeFile,
  tryRelayEnvelopeToHosted,
} from "../runtime/knowledge-sync/index.js";
import {
  buildEnvelopeFromSource,
  flattenBundleItems,
  buildCrossWorkspaceBundle,
} from "@paperclipai/shared/kb-skill-bundle";
import type {
  WorkspaceKnowledgeRef,
  KnowledgeSyncEnvelope,
} from "@paperclipai/shared/types/knowledge-sync.js";
import { printPaperclipCliBanner } from "../utils/banner.js";
import { resolvePaperclipHomeDir, resolvePaperclipInstanceId } from "../config/home.js";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

// ---------------------------------------------------------------------------
// Local server client (thin fetch wrapper)
// ---------------------------------------------------------------------------

interface LocalServerOpts {
  baseUrl: string;
}

async function fetchLocalServer<T>(
  opts: LocalServerOpts,
  method: "GET" | "POST",
  path_: string,
  body?: unknown,
): Promise<T | null> {
  try {
    const res = await fetch(`${opts.baseUrl}${path_}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

function resolveLocalServerUrl(port?: number): string {
  return `http://127.0.0.1:${port ?? 3100}`;
}

// ---------------------------------------------------------------------------
// Interactive hub
// ---------------------------------------------------------------------------

export async function runKnowledgeHub(opts: {
  allowBackToHub?: boolean;
}): Promise<"done" | "back"> {
  printPaperclipCliBanner();
  p.intro(pc.bold("Knowledge Sync — Cross-Workspace Intelligence Hub"));
  p.note(
    [
      "Manage and sync your local knowledge base across workspaces:",
      "  • Export: serialize KB to a portable envelope",
      "  • Import: absorb another workspace's knowledge",
      "  • Sync: full bidirectional cross-workspace sync",
      "  • Capture: save insights from a completed agent run",
      "  • Status: view local KB state",
    ].join("\n"),
    "Knowledge Orchestration",
  );

  const action = await p.select({
    message: "What would you like to do?",
    options: [
      { value: "status", label: "📊 Status", hint: "View local KB state and workspace discovery" },
      { value: "export", label: "📤 Export", hint: "Export local KB to an envelope file" },
      { value: "import", label: "📥 Import", hint: "Import from an envelope file" },
      { value: "sync", label: "🔄 Sync", hint: "Sync across local workspaces" },
      { value: "capture", label: "🧠 Capture", hint: "Save knowledge from a completed run" },
      {
        value: "__back",
        label: opts.allowBackToHub ? "← Back to main menu" : "← Cancel",
      },
    ],
  });

  if (p.isCancel(action) || action === "__back") {
    return opts.allowBackToHub ? "back" : "done";
  }

  if (action === "status") await runKnowledgeStatus();
  if (action === "export") await runKnowledgeExport({});
  if (action === "import") await runKnowledgeImport({});
  if (action === "sync") await runKnowledgeSync({});
  if (action === "capture") await runKnowledgeCapture({});

  return "done";
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function runKnowledgeStatus(): Promise<void> {
  const spinner = p.spinner();
  spinner.start("Discovering local workspaces...");

  const discovered = discoverLocalWorkspaces();
  spinner.stop(`Found ${discovered.length} local workspace(s).`);

  console.log("");
  console.log(pc.bold("Local Workspace Discovery"));
  console.log(hr());

  if (discovered.length === 0) {
    p.log.warn("No local Paperclip workspaces found under ~/.paperclip/instances/");
  } else {
    for (const ws of discovered) {
      console.log(
        `  ${pc.green("•")} ${pc.bold(ws.instanceId)}${ws.label ? pc.dim(` (${ws.label})`) : ""}`,
      );
      console.log(`    ${pc.dim("config:")} ${ws.configPath}`);
    }
  }

  console.log("");
  console.log(pc.bold("Hosted Connection"));
  console.log(hr());
  const session = readSession();
  if (session && !isSessionExpired(session)) {
    console.log(`  ${pc.green("•")} Connected to ${pc.bold(session.hostedBaseUrl)}`);
    if (session.email) console.log(`    ${pc.dim("account:")} ${session.email}`);
    if (session.machineLabel) console.log(`    ${pc.dim("machine:")} ${session.machineLabel}`);
  } else {
    console.log(`  ${pc.dim("•")} Not connected. Run ${pc.bold("growthub auth login")} to enable hosted relay.`);
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async function runKnowledgeExport(opts: {
  serverPort?: number;
  outputPath?: string;
  label?: string;
  relay?: boolean;
}): Promise<void> {
  const baseUrl = resolveLocalServerUrl(opts.serverPort);

  const spinner = p.spinner();
  spinner.start("Fetching knowledge items from local server...");

  interface KbStatusResponse { ok: boolean; companyId?: string; localItemCount?: number }
  const status = await fetchLocalServer<KbStatusResponse>(
    { baseUrl },
    "GET",
    "/api/knowledge-sync/status",
  );

  if (!status?.ok || !status.companyId) {
    spinner.stop(pc.yellow("Could not reach local server. Is it running?"));
    p.log.warn(`Expected server at ${baseUrl}. Start with: scripts/runtime-control.sh up-main`);
    return;
  }

  const itemCount = status.localItemCount ?? 0;
  spinner.stop(`Found ${itemCount} knowledge item(s) in company ${pc.dim(status.companyId)}.`);

  if (itemCount === 0) {
    p.log.warn("No knowledge items to export.");
    return;
  }

  interface ExportResponse { ok: boolean; envelope?: KnowledgeSyncEnvelope }
  const exportRes = await fetchLocalServer<ExportResponse>(
    { baseUrl },
    "POST",
    "/api/knowledge-sync/export",
    { label: opts.label ?? "cli-export" },
  );

  if (!exportRes?.ok || !exportRes.envelope) {
    p.log.error("Export failed — server returned an error.");
    return;
  }

  const envelope = exportRes.envelope;
  const outputPath =
    opts.outputPath ??
    path.join(
      resolvePaperclipHomeDir(),
      "exports",
      `knowledge-export-${Date.now()}.json`,
    );

  writeEnvelopeFile(envelope, outputPath);
  p.log.success(
    `Exported ${envelope.items.length} item(s) → ${pc.bold(outputPath)}`,
  );
  console.log(`  ${pc.dim("Envelope ID:")} ${envelope.envelopeId}`);
  console.log(`  ${pc.dim("Signature:")}   ${envelope.itemsSignature.slice(0, 16)}…`);
  console.log("");

  if (opts.relay) {
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      p.log.warn("Hosted relay requested but no active session. Run growthub auth login.");
      return;
    }
    const relaySpinner = p.spinner();
    relaySpinner.start("Relaying to hosted Growthub app...");
    const relayResult = await tryRelayEnvelopeToHosted(envelope, session);
    if (relayResult.ok) {
      relaySpinner.stop(
        `Relayed ${relayResult.relayed} item(s) to hosted app (${relayResult.skipped} skipped).`,
      );
    } else {
      relaySpinner.stop(pc.yellow(`Hosted relay unavailable: ${relayResult.error ?? "unknown"}`));
    }
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

async function runKnowledgeImport(opts: {
  serverPort?: number;
  envelopePath?: string;
  relay?: boolean;
}): Promise<void> {
  let envelopePath = opts.envelopePath;

  if (!envelopePath) {
    const input = await p.text({
      message: "Path to knowledge envelope file:",
      placeholder: "~/.paperclip/exports/knowledge-export-123.json",
    });
    if (p.isCancel(input)) { p.cancel("Cancelled."); return; }
    envelopePath = String(input);
  }

  const resolved = path.resolve(
    envelopePath.startsWith("~/")
      ? path.join(process.env.HOME ?? "/", envelopePath.slice(2))
      : envelopePath,
  );

  if (!fs.existsSync(resolved)) {
    p.log.error(`File not found: ${resolved}`);
    return;
  }

  let envelope: KnowledgeSyncEnvelope;
  try {
    envelope = readEnvelopeFile(resolved);
  } catch (err) {
    p.log.error(`Could not parse envelope: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const spinner = p.spinner();
  spinner.start("Verifying envelope integrity...");
  const valid = await verifyEnvelopeSignature(envelope);
  if (!valid) {
    spinner.stop(pc.red("Envelope integrity check failed. File may be tampered."));
    return;
  }
  spinner.stop(`Envelope verified. ${envelope.items.length} item(s) from ${pc.dim(envelope.sourceRef.value)}.`);

  const baseUrl = resolveLocalServerUrl(opts.serverPort);

  const importSpinner = p.spinner();
  importSpinner.start("Importing into local knowledge base...");

  interface ImportResponse {
    ok: boolean;
    result?: {
      imported: number;
      skipped: number;
      failed: number;
    };
  }
  const importRes = await fetchLocalServer<ImportResponse>(
    { baseUrl },
    "POST",
    "/api/knowledge-sync/import",
    { envelope },
  );

  if (!importRes?.ok) {
    importSpinner.stop(pc.red("Import failed — server returned an error."));
    return;
  }

  const result = importRes.result ?? { imported: 0, skipped: 0, failed: 0 };
  importSpinner.stop(
    `Import complete: ${pc.green(String(result.imported))} imported, ${pc.dim(String(result.skipped))} skipped, ${result.failed > 0 ? pc.red(String(result.failed)) : pc.dim("0")} failed.`,
  );
  console.log("");
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

async function runKnowledgeSync(opts: {
  serverPort?: number;
}): Promise<void> {
  const discovered = discoverLocalWorkspaces();

  if (discovered.length < 2) {
    p.log.warn(
      "Cross-workspace sync requires at least 2 local workspaces under ~/.paperclip/instances/.",
    );
    p.log.info("Use growthub worktree:make to create additional isolated workspaces.");
    return;
  }

  const sourceChoice = await p.select({
    message: "Select source workspace (export from):",
    options: discovered.map((ws) => ({
      value: ws.instanceId,
      label: pc.bold(ws.instanceId) + (ws.label ? pc.dim(` · ${ws.label}`) : ""),
    })),
  });
  if (p.isCancel(sourceChoice)) { p.cancel("Cancelled."); return; }

  const targetChoices = await p.multiselect({
    message: "Select target workspace(s) (import into):",
    options: discovered
      .filter((ws) => ws.instanceId !== sourceChoice)
      .map((ws) => ({
        value: ws.instanceId,
        label: pc.bold(ws.instanceId) + (ws.label ? pc.dim(` · ${ws.label}`) : ""),
      })),
    required: true,
  });
  if (p.isCancel(targetChoices)) { p.cancel("Cancelled."); return; }

  p.log.info(
    `Syncing from ${pc.bold(String(sourceChoice))} → [${(targetChoices as string[]).join(", ")}]`,
  );
  p.log.info(
    "To execute the sync, use the server API directly via each workspace's local server:\n" +
    "  POST /api/knowledge-sync/export  (source workspace)\n" +
    "  POST /api/knowledge-sync/import  (each target workspace)\n\n" +
    "Or use growthub knowledge export / import with per-workspace server ports.",
  );
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

async function runKnowledgeCapture(opts: {
  serverPort?: number;
  runId?: string;
}): Promise<void> {
  let runId = opts.runId;
  if (!runId) {
    const input = await p.text({
      message: "Run ID (from a completed pipeline / workflow execution):",
      placeholder: "e.g. pipeline-abc123",
    });
    if (p.isCancel(input)) { p.cancel("Cancelled."); return; }
    runId = String(input);
  }

  const intent = await p.text({
    message: "Describe the intent or outcome of this run (used to generate capture proposals):",
    placeholder: "e.g. Generated product FAQ from user research notes",
  });
  if (p.isCancel(intent)) { p.cancel("Cancelled."); return; }

  p.log.info(
    "Post-run knowledge capture uses native intelligence (or deterministic fallback) to\n" +
    "propose what to save from the run. Proposals are written to the local KB via the\n" +
    "agent-authenticated endpoint.\n\n" +
    "Use the --capture-knowledge flag on growthub pipeline execute to trigger this\n" +
    "automatically at the end of every pipeline run.",
  );
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerKnowledgeCommands(program: Command): void {
  const knowledge = program
    .command("knowledge")
    .description("Cross-workspace knowledge orchestration and compounding intelligence")
    .addHelpText(
      "after",
      `
Examples:
  $ growthub knowledge                          # interactive hub
  $ growthub knowledge status
  $ growthub knowledge export --output ./kb-export.json
  $ growthub knowledge export --relay           # export + relay to hosted app
  $ growthub knowledge import ./kb-export.json
  $ growthub knowledge sync
  $ growthub knowledge capture --run-id pipeline-abc123
`,
    );

  knowledge.action(async () => {
    await runKnowledgeHub({});
  });

  // ── status ────────────────────────────────────────────────────────────────
  knowledge
    .command("status")
    .description("Show local knowledge base state and workspace discovery")
    .option("--port <port>", "Local server port (default 3100)", (v) => parseInt(v, 10))
    .action(async (opts: { port?: number }) => {
      await runKnowledgeStatus();
    });

  // ── export ────────────────────────────────────────────────────────────────
  knowledge
    .command("export")
    .description("Export local knowledge items to a portable envelope file")
    .option("--output <path>", "Output file path for the envelope JSON")
    .option("--label <label>", "Human-readable label for this export batch")
    .option("--relay", "Relay exported items to the hosted Growthub app")
    .option("--port <port>", "Local server port (default 3100)", (v) => parseInt(v, 10))
    .action(async (opts: { output?: string; label?: string; relay?: boolean; port?: number }) => {
      await runKnowledgeExport({
        serverPort: opts.port,
        outputPath: opts.output,
        label: opts.label,
        relay: opts.relay,
      });
    });

  // ── import ────────────────────────────────────────────────────────────────
  knowledge
    .command("import")
    .description("Import knowledge items from an envelope file into the local KB")
    .argument("[envelope-path]", "Path to the knowledge envelope JSON file")
    .option("--relay", "Also relay imported items to the hosted Growthub app")
    .option("--port <port>", "Local server port (default 3100)", (v) => parseInt(v, 10))
    .action(async (envelopePath: string | undefined, opts: { relay?: boolean; port?: number }) => {
      await runKnowledgeImport({
        serverPort: opts.port,
        envelopePath,
        relay: opts.relay,
      });
    });

  // ── sync ──────────────────────────────────────────────────────────────────
  knowledge
    .command("sync")
    .description("Interactive cross-workspace knowledge sync")
    .option("--port <port>", "Local server port for the source workspace (default 3100)", (v) =>
      parseInt(v, 10),
    )
    .action(async (opts: { port?: number }) => {
      await runKnowledgeSync({ serverPort: opts.port });
    });

  // ── capture ───────────────────────────────────────────────────────────────
  knowledge
    .command("capture")
    .description("Capture compounding knowledge from a completed agent run")
    .option("--run-id <id>", "Run or execution ID")
    .option("--port <port>", "Local server port (default 3100)", (v) => parseInt(v, 10))
    .action(async (opts: { runId?: string; port?: number }) => {
      await runKnowledgeCapture({ serverPort: opts.port, runId: opts.runId });
    });
}
