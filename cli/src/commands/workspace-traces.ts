/**
 * `growthub workspace traces` — AWaC sandbox receipt → distillation corpus export.
 *
 * Reads `growthub.source-records.json` from a governed workspace app directory
 * and emits JSONL suitable for OpenAI-style SFT (messages: system / user / assistant).
 */

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { track } from "../analytics/posthog.js";
import {
  exportSandboxTracesToJsonlLines,
  readSourceRecordsJson,
  resolveSourceRecordsPath,
} from "../runtime/workspace/sandbox-trace-distillation.js";

function resolveWorkspaceArg(opt: string | undefined): string {
  return opt ? path.resolve(opt) : process.cwd();
}

export function registerWorkspaceTraceCommands(workspaceCommand: Command): void {
  const traces = workspaceCommand
    .command("traces")
    .description("Export sandbox run history from the workspace sidecar for distillation / SFT tooling");

  traces
    .command("export-sft")
    .description(
      "Convert sandbox-environment run receipts in growthub.source-records.json to JSONL (chat messages + growthub_distillation_v1 metadata)",
    )
    .option(
      "--workspace <path>",
      "Fork root or apps/workspace directory containing growthub.config.json (default: cwd)",
    )
    .option("--out <file>", "Write JSONL to this file (default: stdout)")
    .option("--success-only", "Only include runs where exitCode === 0", false)
    .option("--require-stdout", "Skip runs with empty stdout", false)
    .option("--default-role <slug>", "Optional GTM/agent role label stored on every line (e.g. sdr-qualification)")
    .option("--json", "Print summary JSON to stderr; JSONL lines still go to --out or stdout", false)
    .action(
      (opts: {
        workspace?: string;
        out?: string;
        successOnly?: boolean;
        requireStdout?: boolean;
        defaultRole?: string;
        json?: boolean;
      }) => {
        const root = resolveWorkspaceArg(opts.workspace);
        const resolved = resolveSourceRecordsPath(root);
        if (!resolved) {
          const msg =
            "Could not find growthub.source-records.json beside growthub.config.json. " +
            "Pass --workspace to your exported workspace app root (…/apps/workspace) or fork root.";
          if (opts.json) {
            console.error(JSON.stringify({ status: "error", error: msg }));
          } else {
            console.error(pc.red(msg));
          }
          process.exitCode = 1;
          return;
        }

        let raw: unknown;
        try {
          raw = readSourceRecordsJson(resolved.sourceRecordsPath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (opts.json) {
            console.error(JSON.stringify({ status: "error", error: msg }));
          } else {
            console.error(pc.red(`Failed to read source records: ${msg}`));
          }
          process.exitCode = 1;
          return;
        }

        const { lines, summary } = exportSandboxTracesToJsonlLines(raw, {
          successOnly: Boolean(opts.successOnly),
          requireNonEmptyStdout: Boolean(opts.requireStdout),
          defaultRole: opts.defaultRole?.trim() || null,
        });

        const fullSummary = {
          status: "ok" as const,
          sourceRecordsPath: resolved.sourceRecordsPath,
          workspaceAppDir: resolved.workspaceAppDir,
          ...summary,
        };

        track("workspace_traces_export_sft", {
          linesWritten: summary.linesWritten,
          receiptsSeen: summary.receiptsSeen,
          successOnly: Boolean(opts.successOnly),
        });

        const body = lines.join("");
        if (opts.out) {
          const outPath = path.resolve(opts.out);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, body, "utf8");
        } else {
          process.stdout.write(body);
        }

        if (opts.json) {
          console.error(JSON.stringify(fullSummary));
        } else if (opts.out) {
          console.error(
            pc.dim(
              `Wrote ${summary.linesWritten} JSONL lines (${summary.receiptsSeen} sandbox receipts seen) → ${opts.out}`,
            ),
          );
        }
      },
    );
}
