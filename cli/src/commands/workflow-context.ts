/**
 * CLI Command — `growthub workflow context <workflowId>`
 *
 * Emits a CMS Workflow Context Packet (v1) for the given workflow id and
 * (optionally) agent slug. Read-only: never mutates `.growthub-fork/` state
 * and never writes trace.
 *
 * Contract: docs/CMS_WORKFLOW_CONTEXT_PACKET_V1.md
 *
 * Exit codes:
 *   0 — packet emitted (with or without warn-severity stop conditions)
 *   1 — unrecoverable input error (no workflowId, missing fork id, etc.)
 *   2 — `--strict` was set and the packet contains an error-severity stop condition
 */

import { Command } from "commander";
import pc from "picocolors";
import { getWorkflowAccess } from "../auth/workflow-access.js";
import {
  composeCmsWorkflowContextPacket,
  type CmsWorkflowContextPacket,
  type StopCondition,
} from "../runtime/cms-workflow-context/index.js";

interface WorkflowContextOptions {
  agent?: string;
  workspace?: string;
  forkId?: string;
  traceTail?: string;
  json?: boolean;
  pretty?: boolean;
  strict?: boolean;
}

function parseTraceTail(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function severityIcon(severity: StopCondition["severity"]): string {
  switch (severity) {
    case "error":
      return pc.red("✗");
    case "warn":
      return pc.yellow("!");
    case "info":
      return pc.dim("·");
  }
}

function renderHuman(packet: CmsWorkflowContextPacket, warnings: string[]): void {
  console.log("");
  console.log(pc.bold("CMS Workflow Context Packet") + pc.dim(`  v${packet.version}`));
  console.log(pc.dim("─".repeat(72)));

  console.log(`  ${pc.dim("Workflow:")}    ${pc.bold(packet.workflow.name)} ${pc.dim(`(${packet.workflow.id})`)}`);
  console.log(`  ${pc.dim("Authority:")}   ${packet.workflow.executionAuthority}  ·  ${packet.workflow.executionMode}`);
  if (packet.agent) {
    const bound = packet.agent.bound ? pc.green("bound") : pc.yellow("unbound");
    console.log(`  ${pc.dim("Agent:")}       ${packet.agent.slug}  ·  ${bound}`);
  } else {
    console.log(`  ${pc.dim("Agent:")}       ${pc.yellow("not resolved")}`);
  }
  if (packet.workspace.path) {
    const reg = packet.workspace.forkRegistered ? pc.green("governed") : pc.yellow("local-only");
    console.log(`  ${pc.dim("Workspace:")}   ${packet.workspace.path}  ·  ${reg}`);
  }
  console.log(`  ${pc.dim("Nodes:")}       ${packet.nodes.length}`);
  console.log(`  ${pc.dim("Generated:")}   ${packet.generatedAt}`);
  console.log("");

  if (packet.stopConditions.length > 0) {
    console.log(pc.bold("Stop conditions"));
    for (const sc of packet.stopConditions) {
      const where = sc.nodeId ? pc.dim(` [${sc.nodeId}]`) : "";
      console.log(`  ${severityIcon(sc.severity)} ${pc.dim(sc.code)}${where}  ${sc.detail}`);
      if (sc.hint) console.log(`     ${pc.dim(sc.hint)}`);
    }
    console.log("");
  }

  if (warnings.length > 0) {
    console.log(pc.bold("Warnings"));
    for (const w of warnings) console.log(`  ${pc.yellow("!")} ${w}`);
    console.log("");
  }

  console.log(pc.dim("Re-run with --json to emit the full packet."));
  console.log("");
}

export function registerWorkflowContextCommand(parent: Command): void {
  parent
    .command("context <workflowId>")
    .description("Emit a CMS Workflow Context Packet (v1) for an agent operating on this workflow")
    .option("--agent <slug>", "Agent slug to scope the packet to")
    .option("--workspace <path>", "Workspace path (defaults to current directory)")
    .option("--fork-id <id>", "Resolve workspace from a registered fork id")
    .option("--trace-tail <n>", "Number of trace events to include", "20")
    .option("--json", "Emit the full packet as JSON (default for non-TTY stdout)")
    .option("--pretty", "Pretty-print JSON output (only meaningful with --json)")
    .option("--strict", "Exit non-zero when an error-severity stop condition is present")
    .addHelpText(
      "after",
      `
Examples:
  $ growthub workflow context wf_123 --agent workspace-operator --json
  $ growthub workflow context wf_123 --fork-id my-fork --strict
  $ growthub workflow context wf_123 --workspace ./forks/video-studio --trace-tail 50

Exit codes:
  0   packet emitted
  1   unrecoverable input error
  2   --strict and an error-severity stop condition is present

Contract: docs/CMS_WORKFLOW_CONTEXT_PACKET_V1.md
`,
    )
    .action(async (workflowId: string, opts: WorkflowContextOptions) => {
      const access = getWorkflowAccess();
      const bridgeAuthUnavailable = access.state !== "ready";

      let result;
      try {
        result = await composeCmsWorkflowContextPacket({
          workflowId,
          agentSlug: opts.agent,
          workspacePath: opts.workspace,
          forkId: opts.forkId,
          traceTailLimit: parseTraceTail(opts.traceTail),
          bridgeAuthUnavailable,
        });
      } catch (err) {
        console.error(pc.red(`Failed: ${(err as Error).message}`));
        process.exitCode = 1;
        return;
      }

      const { packet, warnings } = result;
      const wantJson = opts.json ?? !process.stdout.isTTY;

      if (wantJson) {
        const indent = opts.pretty ? 2 : 0;
        console.log(JSON.stringify(packet, null, indent));
      } else {
        renderHuman(packet, warnings);
      }

      if (opts.strict && packet.stopConditions.some((sc) => sc.severity === "error")) {
        process.exitCode = 2;
      }
    });
}
