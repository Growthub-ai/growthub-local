/**
 * `growthub workspace helper` — Workspace-native helper CLI surface.
 *
 * Dispatches intents to the workspace helper endpoint and surfaces
 * structured proposals for review and governed apply.
 *
 *   growthub workspace helper query --intent build_dashboard --prompt "..."
 *   growthub workspace helper apply --proposal-file <path> [--yes]
 *   growthub workspace helper receipts [--limit 25]
 *
 * All commands require a running workspace dev server. Use --workspace-url
 * to point at the workspace base URL (default: http://localhost:3000).
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import { renderTable } from "../utils/table-renderer.js";

const VALID_INTENTS = [
  "build_dashboard",
  "create_widget",
  "register_api",
  "create_object",
  "edit_view",
  "repair",
  "explain",
] as const;

type HelperIntent = (typeof VALID_INTENTS)[number];

const INTENT_DESCRIPTIONS: Record<HelperIntent, string> = {
  build_dashboard: "Draft dashboard configs, sections, and starter widget layouts",
  create_widget: "Suggest widget types and canvas placements for your workspace",
  register_api: "Draft API Registry rows with labels, credentials, and endpoints",
  create_object: "Translate domain language into a new custom business object",
  edit_view: "Update an existing dashboard or canvas layout",
  repair: "Inspect and propose fixes for broken references or incomplete views",
  explain: "Get a clear explanation of workspace objects and configurations",
};

function resolveWorkspaceUrl(optUrl: string | undefined): string {
  if (optUrl) return optUrl.replace(/\/+$/, "");
  return process.env.GROWTHUB_WORKSPACE_URL?.replace(/\/+$/, "") || "http://localhost:3000";
}

function printProposalTable(proposals: unknown[]): void {
  if (!Array.isArray(proposals) || proposals.length === 0) {
    console.log(pc.dim("  No proposals returned."));
    return;
  }
  console.log("");
  console.log(pc.bold(`Proposals`) + pc.dim(`  ${proposals.length} total`));
  console.log(pc.dim("─".repeat(80)));
  console.log(
    renderTable({
      columns: [
        { key: "idx", label: "#", maxWidth: 4 },
        { key: "type", label: "type", maxWidth: 30 },
        { key: "field", label: "field", maxWidth: 12 },
        { key: "rationale", label: "rationale", maxWidth: 56 },
      ],
      rows: (proposals as Array<{ type: string; affectedField: string; rationale: string }>).map(
        (p, i) => ({
          idx: String(i + 1),
          type: p.type,
          field: p.affectedField,
          rationale: p.rationale || "",
        })
      ),
    })
  );
  console.log("");
}

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

async function runQuery(opts: {
  intent: string;
  prompt: string;
  workspaceUrl?: string;
  model?: string;
  adapterMode?: string;
  localEndpoint?: string;
  json?: boolean;
}): Promise<void> {
  const intent = opts.intent as HelperIntent;
  if (!VALID_INTENTS.includes(intent)) {
    const msg = `--intent must be one of: ${VALID_INTENTS.join(", ")}`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  const baseUrl = resolveWorkspaceUrl(opts.workspaceUrl);
  const url = `${baseUrl}/api/workspace/helper/query`;

  const s = p.spinner();
  if (!opts.json) s.start(`Querying workspace helper (${pc.cyan(intent)}) …`);

  const body: Record<string, unknown> = {
    intent,
    userPrompt: opts.prompt,
    mode: "propose",
  };
  if (opts.model) body.model = opts.model;
  if (opts.adapterMode) body.adapterMode = opts.adapterMode;
  if (opts.localEndpoint) body.localEndpoint = opts.localEndpoint;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = `Could not reach workspace at ${baseUrl}. Is the dev server running?\n  ${(err as Error).message}`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    s.stop(pc.red("Connection failed."));
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    const msg = `Workspace returned non-JSON response (HTTP ${res.status}).`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    s.stop(pc.red("Parse failed."));
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  if (!res.ok || !data.ok) {
    const msg = (data.error as string) || `Helper returned HTTP ${res.status}.`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg, data }));
      process.exitCode = 1;
      return;
    }
    s.stop(pc.red("Helper query failed."));
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", ...data }, null, 2));
    return;
  }

  s.stop(pc.green("Helper responded."));

  console.log("");
  console.log(`  ${pc.bold("Summary:")} ${data.summary as string}`);

  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  if (warnings.length > 0) {
    console.log(`  ${pc.bold("Warnings:")} ${warnings.join("; ")}`);
  }

  const receipts = data.receipts as Record<string, unknown> | undefined;
  if (receipts) {
    console.log(
      `  ${pc.dim(`model: ${receipts.model}  confidence: ${typeof receipts.confidence === "number" ? receipts.confidence.toFixed(2) : "n/a"}  latency: ${receipts.latencyMs}ms`)}`
    );
  }

  printProposalTable(data.proposals as unknown[]);

  const proposals = Array.isArray(data.proposals) ? data.proposals : [];
  if (proposals.length > 0) {
    console.log(
      pc.dim(
        `  To apply proposals: growthub workspace helper apply --proposal-file <output.json>`
      )
    );
    console.log(pc.dim(`  Write proposals:   growthub workspace helper query ... --json > proposals.json`));
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

async function runApply(opts: {
  proposalFile?: string;
  workspaceUrl?: string;
  reviewedBy?: string;
  sessionId?: string;
  yes?: boolean;
  json?: boolean;
}): Promise<void> {
  if (!opts.proposalFile) {
    const msg = "--proposal-file is required. Pipe from: growthub workspace helper query --json > proposals.json";
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  const filePath = path.resolve(opts.proposalFile);
  if (!fs.existsSync(filePath)) {
    const msg = `Proposal file not found: ${filePath}`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  let fileData: Record<string, unknown>;
  try {
    fileData = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    const msg = `Could not parse proposal file: ${(err as Error).message}`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  const proposals: unknown[] = Array.isArray(fileData.proposals)
    ? fileData.proposals
    : Array.isArray(fileData)
    ? fileData
    : [];

  if (proposals.length === 0) {
    const msg = "No proposals found in file. File must contain { proposals: [...] } or a bare array.";
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  if (!opts.json) {
    printProposalTable(proposals);
  }

  if (!opts.yes && !opts.json) {
    const confirmed = await p.confirm({
      message: `Apply ${proposals.length} proposal(s) to the workspace?`,
      initialValue: true,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Apply cancelled.");
      process.exit(0);
    }
  }

  const baseUrl = resolveWorkspaceUrl(opts.workspaceUrl);
  const url = `${baseUrl}/api/workspace/helper/apply`;

  const s = p.spinner();
  if (!opts.json) s.start(`Applying ${proposals.length} proposal(s) …`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        proposals,
        reviewedBy: opts.reviewedBy || "cli",
        sessionId: opts.sessionId,
      }),
    });
  } catch (err) {
    const msg = `Could not reach workspace at ${baseUrl}. Is the dev server running?\n  ${(err as Error).message}`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    s.stop(pc.red("Connection failed."));
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: `HTTP ${res.status}` }));
      process.exitCode = 1;
      return;
    }
    s.stop(pc.red(`HTTP ${res.status}`));
    process.exitCode = 1;
    return;
  }

  if (!res.ok || !data.ok) {
    const msg = (data.error as string) || `Apply returned HTTP ${res.status}.`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg, data }));
      process.exitCode = 1;
      return;
    }
    s.stop(pc.red("Apply failed."));
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify({ status: "ok", ...data }, null, 2));
    return;
  }

  const applied = Array.isArray(data.applied) ? data.applied : [];
  const skipped = Array.isArray(data.skipped) ? data.skipped : [];

  s.stop(pc.green(`${applied.length} proposal(s) applied.`));

  if (applied.length > 0) {
    console.log("");
    console.log(pc.bold("Applied:"));
    for (const r of applied as Array<{ type: string; affectedField: string }>) {
      console.log(`  ${pc.green("✓")} ${r.type} → ${r.affectedField}`);
    }
  }
  if (skipped.length > 0) {
    console.log("");
    console.log(pc.bold("Skipped:"));
    for (const s of skipped as Array<{ proposal: { type: string }; reason: string }>) {
      console.log(`  ${pc.yellow("⚠")} ${s.proposal?.type || "?"}: ${s.reason}`);
    }
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// receipts
// ---------------------------------------------------------------------------

async function runReceipts(opts: {
  workspaceUrl?: string;
  limit?: number;
  type?: string;
  json?: boolean;
}): Promise<void> {
  const baseUrl = resolveWorkspaceUrl(opts.workspaceUrl);
  const limit = opts.limit || 25;
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts.type) params.set("type", opts.type);
  const url = `${baseUrl}/api/workspace/helper/receipts?${params}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (err) {
    const msg = `Could not reach workspace at ${baseUrl}.\n  ${(err as Error).message}`;
    if (opts.json) {
      console.log(JSON.stringify({ status: "error", error: msg }));
      process.exitCode = 1;
      return;
    }
    console.error(pc.red(msg));
    process.exitCode = 1;
    return;
  }

  const data = await res.json() as Record<string, unknown>;

  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const records = Array.isArray(data.records) ? data.records : [];
  if (records.length === 0) {
    console.log(pc.dim("No apply receipts found. Run: growthub workspace helper apply"));
    return;
  }

  console.log("");
  console.log(pc.bold(`Helper Apply Receipts`) + pc.dim(`  ${records.length} shown`));
  console.log(pc.dim("─".repeat(80)));
  console.log(
    renderTable({
      columns: [
        { key: "type", label: "type", maxWidth: 30 },
        { key: "field", label: "field", maxWidth: 12 },
        { key: "reviewedBy", label: "by", maxWidth: 16 },
        { key: "appliedAt", label: "applied", maxWidth: 20 },
        { key: "rationale", label: "rationale", maxWidth: 40 },
      ],
      rows: (records as Array<{ type: string; affectedField: string; reviewedBy: string; appliedAt: string; rationale: string }>).map(
        (r) => ({
          type: r.type,
          field: r.affectedField,
          reviewedBy: r.reviewedBy || "user",
          appliedAt: (r.appliedAt || "").slice(0, 16).replace("T", " "),
          rationale: r.rationale || "",
        })
      ),
    })
  );
  console.log("");
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerWorkspaceHelperCommands(program: Command): void {
  const workspace =
    (program.commands.find((c) => c.name() === "workspace") as Command | undefined) ||
    program.command("workspace").description("Governed workspace operations");

  const helper = workspace
    .command("helper")
    .description("Workspace-native builder helper — propose and apply governed workspace changes")
    .addHelpText(
      "after",
      `
Intents:
${VALID_INTENTS.map((i) => `  ${i.padEnd(20)} ${INTENT_DESCRIPTIONS[i]}`).join("\n")}

Examples:
  $ growthub workspace helper query --intent build_dashboard --prompt "Sales ops dashboard for a local agency"
  $ growthub workspace helper query --intent build_dashboard --prompt "..." --json > proposals.json
  $ growthub workspace helper apply --proposal-file proposals.json
  $ growthub workspace helper receipts
`
    );

  helper
    .command("query")
    .description("Ask the workspace helper to draft proposals for a given intent")
    .requiredOption("--intent <intent>", `Intent to execute: ${VALID_INTENTS.join(" | ")}`)
    .requiredOption("--prompt <text>", "Natural-language business brief")
    .option("--workspace-url <url>", "Workspace base URL (default: http://localhost:3000)")
    .option("--model <model>", "Override local model (e.g. gemma3:4b, llama3.1:8b)")
    .option("--adapter-mode <mode>", "Override adapter mode: ollama | lmstudio | vllm")
    .option("--local-endpoint <url>", "Override inference endpoint URL")
    .option("--json", "Emit machine-readable JSON (pipe to proposal file)")
    .action(
      async (opts: {
        intent: string;
        prompt: string;
        workspaceUrl?: string;
        model?: string;
        adapterMode?: string;
        localEndpoint?: string;
        json?: boolean;
      }) => {
        await runQuery(opts);
      }
    );

  helper
    .command("apply")
    .description("Apply accepted proposals from a prior query to the workspace")
    .requiredOption("--proposal-file <path>", "Path to JSON file containing proposals (from query --json)")
    .option("--workspace-url <url>", "Workspace base URL (default: http://localhost:3000)")
    .option("--reviewed-by <name>", "Name or identifier of the reviewer (default: cli)")
    .option("--session-id <id>", "Session identifier linking this apply to a prior query")
    .option("--yes", "Skip confirmation prompt")
    .option("--json", "Emit machine-readable JSON")
    .action(
      async (opts: {
        proposalFile?: string;
        workspaceUrl?: string;
        reviewedBy?: string;
        sessionId?: string;
        yes?: boolean;
        json?: boolean;
      }) => {
        await runApply(opts);
      }
    );

  helper
    .command("receipts")
    .description("List accepted proposal receipts (fine-tune loop history)")
    .option("--workspace-url <url>", "Workspace base URL (default: http://localhost:3000)")
    .option("--limit <n>", "Max records to return (default: 25)", parseInt)
    .option("--type <type>", "Filter by proposal type")
    .option("--json", "Emit machine-readable JSON")
    .action(
      async (opts: {
        workspaceUrl?: string;
        limit?: number;
        type?: string;
        json?: boolean;
      }) => {
        await runReceipts(opts);
      }
    );
}
