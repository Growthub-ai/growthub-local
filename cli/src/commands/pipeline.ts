/**
 * CLI Commands — pipeline
 *
 * growthub pipeline assemble     — Interactive assembly of a dynamic registry pipeline
 * growthub pipeline validate     — Validate a pipeline file/JSON
 * growthub pipeline execute      — Execute a pipeline through hosted runtime
 *
 * Interactive assembler is available via `growthub pipeline` (no subcommand).
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import { readSession, isSessionExpired } from "../auth/session-store.js";
import {
  fetchHostedCredits,
  saveHostedWorkflow,
  HostedEndpointUnavailableError,
} from "../auth/hosted-client.js";
import {
  createCmsCapabilityRegistryClient,
  type CmsCapabilityNode,
} from "../runtime/cms-capability-registry/index.js";
import {
  createPipelineBuilder,
  serializePipeline,
  deserializePipeline,
  type DynamicRegistryPipeline,
} from "../runtime/dynamic-registry-pipeline/index.js";
import {
  compileToHostedWorkflowConfig,
  inferWorkflowName,
  normalizeNodeBindings,
  buildPreExecutionSummary,
  renderPreExecutionSummary,
} from "../runtime/cms-node-contracts/index.js";
import {
  createHostedExecutionClient,
} from "../runtime/hosted-execution-client/index.js";
import {
  createArtifactStore,
} from "../runtime/artifact-contracts/index.js";
import { getWorkflowAccess } from "../auth/workflow-access.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

function box(lines: string[]): string {
  const padded = lines.map((l) => "  " + l);
  const width = Math.max(...padded.map((l) => stripAnsi(l).length)) + 4;
  const top    = pc.dim("┌" + "─".repeat(width) + "┐");
  const bottom = pc.dim("└" + "─".repeat(width) + "┘");
  const body = padded.map((l) => {
    const pad = width - stripAnsi(l).length;
    return pc.dim("│") + l + " ".repeat(pad) + pc.dim("│");
  });
  return [top, ...body, bottom].join("\n");
}

// ---------------------------------------------------------------------------
// Interactive pipeline assembler
// ---------------------------------------------------------------------------

export async function runPipelineAssembler(opts: {
  allowBackToHub?: boolean;
}): Promise<"done" | "back"> {
  printPaperclipCliBanner();
  p.intro(pc.bold("Dynamic Registry Pipeline Assembler"));
  p.note(
    [
      "Dynamic pipeline creation flow:",
      "  1) Select capability nodes",
      "  2) Normalize required bindings",
      "  3) Validate graph",
      "  4) Pre-execution contract summary",
      "  5) Save to Saved Workflows",
      "  6) Execute hosted workflow",
    ].join("\n"),
    "Interactive Tree",
  );

  const access = getWorkflowAccess();
  if (access.state !== "ready") {
    p.note(
      [
        "Dynamic Pipelines are unavailable until the hosted user is linked to this local machine.",
        access.reason,
      ].join("\n"),
      "Growthub Local Machine Required",
    );
    return opts.allowBackToHub ? "back" : "done";
  }

  if (opts.allowBackToHub) {
    const entryChoice = await p.select({
      message: "Dynamic Pipelines (hosted-only)",
      options: [
        { value: "start", label: "Start interactive assembler" },
        { value: "__back_to_hub", label: "← Back to workflow menu" },
      ],
    });
    if (p.isCancel(entryChoice)) { p.cancel("Cancelled."); process.exit(0); }
    if (entryChoice === "__back_to_hub") return "back";
  } else {
    p.note("Execution mode is fixed to hosted for Dynamic Pipelines.", "Hosted only");
  }

  const registry = createCmsCapabilityRegistryClient();
  let capabilities: CmsCapabilityNode[];
  const capabilitiesSpinner = p.spinner();
  capabilitiesSpinner.start("Loading capability list...");

  try {
    const result = await registry.listCapabilities();
    capabilities = result.nodes;
    capabilitiesSpinner.stop(`Loaded ${capabilities.length} capabilities.`);
  } catch (err) {
    capabilitiesSpinner.stop(pc.red("Failed to load capabilities."));
    p.log.error("Failed to load capabilities: " + (err as Error).message);
    return "done";
  }

  if (capabilities.length === 0) {
    p.note("No capabilities available. Ensure you are authenticated.", "Nothing found");
    return "done";
  }

  const builder = createPipelineBuilder({
    executionMode: "hosted",
  });

  // Node assembly loop
  while (true) {
    const currentNodes = builder.getNodes();

    const action = await p.select({
      message: `Pipeline has ${currentNodes.length} node${currentNodes.length !== 1 ? "s" : ""}. What next?`,
      options: [
        { value: "add", label: "➕ Add a node", hint: "Select a capability to add" },
        ...(currentNodes.length > 0 ? [
          { value: "preview", label: "👁️  Preview pipeline" },
          { value: "validate", label: "✅ Validate pipeline" },
          { value: "save", label: "💾 Save to Saved Workflows" },
          { value: "execute", label: "🚀 Execute pipeline" },
        ] : []),
        {
          value: "cancel",
          label: opts.allowBackToHub ? "← Back to workflow menu" : "← Cancel",
        },
      ],
    });

    if (p.isCancel(action)) { p.cancel("Cancelled."); process.exit(0); }

    if (action === "cancel") {
      return opts.allowBackToHub ? "back" : "done";
    }

    if (action === "add") {
      const capChoice = await p.select({
        message: "Select capability to add as pipeline node",
        options: [
          ...capabilities.map((c) => ({
            value: c.slug,
            label: `${pc.bold(c.displayName)}  ${pc.dim(c.slug)}`,
            hint: `${c.family} · ${c.executionKind}`,
          })),
          { value: "__back", label: "← Back" },
        ],
      });

      if (p.isCancel(capChoice)) { p.cancel("Cancelled."); process.exit(0); }
      if (capChoice === "__back") continue;

      const cap = capabilities.find((c) => c.slug === capChoice);
      if (!cap) continue;

      // Collect bindings
      const bindings: Record<string, unknown> = {};
      for (const bindingKey of cap.requiredBindings) {
        const value = await p.text({
          message: `Binding "${bindingKey}" for ${cap.slug}`,
          placeholder: `Enter value for ${bindingKey}`,
        });
        if (p.isCancel(value)) { p.cancel("Cancelled."); process.exit(0); }
        bindings[bindingKey] = value;
      }

      // Upstream node selection (if there are existing nodes)
      let upstreamNodeIds: string[] | undefined;
      if (currentNodes.length > 0) {
        const upstreamChoice = await p.multiselect({
          message: "Select upstream nodes (outputs feed into this node)",
          options: [
            { value: "__none", label: "(no upstream)" },
            ...currentNodes.map((n) => ({
              value: n.id,
              label: `${n.slug} (${n.id})`,
            })),
          ],
          required: false,
        });

        if (p.isCancel(upstreamChoice)) { p.cancel("Cancelled."); process.exit(0); }
        const selected = (upstreamChoice as string[]).filter((v) => v !== "__none");
        if (selected.length > 0) {
          upstreamNodeIds = selected;
        }
      }

      const normalizedBindings = normalizeNodeBindings(bindings, cap);
      const nodeId = builder.addNode(capChoice as string, normalizedBindings.bindings, upstreamNodeIds);
      p.log.success(`Added node ${pc.bold(cap.displayName)} (${pc.dim(nodeId)})`);
      continue;
    }

    if (action === "preview") {
      const pipeline = builder.build();
      console.log("");
      console.log(box([
        `${pc.bold("Pipeline:")} ${pipeline.pipelineId}`,
        `${pc.dim("Mode:")} ${pipeline.executionMode}  ${pc.dim("Nodes:")} ${pipeline.nodes.length}`,
        "",
        ...pipeline.nodes.map((n, i) => {
          const upstream = n.upstreamNodeIds?.length
            ? pc.dim(` ← ${n.upstreamNodeIds.join(", ")}`)
            : "";
          return `${pc.dim(String(i + 1) + ".")} ${pc.bold(n.slug)} ${pc.dim(n.id)}${upstream}`;
        }),
      ]));
      console.log("");
      continue;
    }

    if (action === "validate") {
      try {
        const result = await builder.validate();

        if (result.valid) {
          p.log.success("Pipeline is valid.");
        } else {
          p.log.error("Pipeline validation failed.");
        }

        for (const issue of result.issues) {
          const prefix = issue.severity === "error" ? pc.red("ERROR") : pc.yellow("WARN");
          const nodeRef = issue.nodeId ? ` [${issue.nodeId}]` : "";
          console.log(`  ${prefix}${nodeRef}: ${issue.message}`);
        }
      } catch (err) {
        p.log.error("Validation failed: " + (err as Error).message);
      }
      continue;
    }

    if (action === "save") {
      const session = readSession();
      if (!session || isSessionExpired(session)) {
        p.log.error("Hosted session expired. Run `growthub auth login` again.");
        continue;
      }

      const pipeline = builder.build();
      const defaultName = inferWorkflowName(pipeline);
      const workflowName = await p.text({
        message: "Saved workflow name",
        placeholder: defaultName,
        defaultValue: defaultName,
      });
      if (p.isCancel(workflowName)) { p.cancel("Cancelled."); process.exit(0); }

      const summary = buildPreExecutionSummary({
        pipeline,
        registryBySlug: new Map(capabilities.map((node) => [node.slug, node])),
      });
      console.log("");
      console.log(box(renderPreExecutionSummary(summary)));
      console.log("");

      const confirmed = await p.confirm({
        message: `Save hosted workflow "${workflowName as string}"?`,
        initialValue: true,
      });
      if (p.isCancel(confirmed) || !confirmed) continue;

      try {
        const saveResult = await saveHostedWorkflow(session, {
          name: workflowName as string,
          description: "Saved from Dynamic Pipelines assembler",
          config: compileToHostedWorkflowConfig(pipeline, { workflowName: workflowName as string }),
        });
        if (!saveResult?.workflowId) {
          throw new Error("Hosted workflow save returned no workflow id.");
        }
        p.log.success(
          `Saved to workflow registry as ${pc.bold(workflowName as string)} (${pc.dim(saveResult.workflowId)} · v${saveResult.version}).`,
        );
      } catch (err) {
        if (err instanceof HostedEndpointUnavailableError) {
          p.log.error("Hosted save endpoint is unavailable on this GH app surface.");
        } else {
          p.log.error("Save failed: " + (err as Error).message);
        }
      }
      continue;
    }

    if (action === "execute") {
      // Validate first
      const validation = await builder.validate();
      if (!validation.valid) {
        p.log.error("Pipeline is not valid. Fix errors before executing.");
        for (const issue of validation.issues.filter((i) => i.severity === "error")) {
          console.log(`  ${pc.red("ERROR")}: ${issue.message}`);
        }
        continue;
      }

      const pipeline = builder.build();
      const summary = buildPreExecutionSummary({
        pipeline,
        registryBySlug: new Map(capabilities.map((node) => [node.slug, node])),
      });
      console.log("");
      console.log(box(renderPreExecutionSummary(summary)));
      console.log("");

      const confirmed = await p.confirm({
        message: "Execute this pipeline through the hosted runtime?",
        initialValue: false,
      });
      if (p.isCancel(confirmed) || !confirmed) continue;

      try {
        const executionClient = createHostedExecutionClient();
        const pipeline = builder.build();
        const pkg = await builder.package();

        p.log.info(`Executing pipeline ${pc.bold(pipeline.pipelineId)} (${pkg.executionRoute})...`);

        const result = await executionClient.executeWorkflow({
          pipelineId: pipeline.pipelineId,
          threadId: pipeline.threadId,
          nodes: pipeline.nodes.map((n) => ({
            nodeId: n.id,
            slug: n.slug,
            bindings: n.bindings,
            upstreamNodeIds: n.upstreamNodeIds,
          })),
          executionMode: pipeline.executionMode,
          metadata: pipeline.metadata,
        });

        p.log.success(`Execution ${pc.bold(result.executionId)}: ${result.status}`);

        // Create artifact records for each result artifact
        const artifactStore = createArtifactStore();
        for (const artRef of result.artifacts) {
          const nodeResult = result.nodeResults[artRef.nodeId];
          artifactStore.create({
            artifactType: artRef.artifactType as "video" | "image" | "slides" | "text" | "report" | "pipeline",
            sourceNodeSlug: nodeResult?.slug ?? "unknown",
            executionContext: pipeline.executionMode === "local" ? "local" : "hosted",
            pipelineId: pipeline.pipelineId,
            nodeId: artRef.nodeId,
            threadId: pipeline.threadId,
            metadata: artRef.metadata ?? {},
          });
        }

        if (result.artifacts.length > 0) {
          p.log.info(`${result.artifacts.length} artifact(s) recorded.`);
        }
      } catch (err) {
        p.log.error("Execution failed: " + (err as Error).message);
      }
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// File-based pipeline loading
// ---------------------------------------------------------------------------

function loadPipelineFromFileOrJson(input: string): DynamicRegistryPipeline {
  // Try as file path first
  const resolvedPath = path.resolve(input);
  if (fs.existsSync(resolvedPath)) {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    return deserializePipeline(JSON.parse(content));
  }

  // Try as inline JSON
  try {
    return deserializePipeline(JSON.parse(input));
  } catch {
    throw new Error(
      `"${input}" is not a valid file path or JSON string. ` +
      "Provide a path to a pipeline JSON file or inline JSON.",
    );
  }
}

function renderExecutionProgress(completed: number, total: number, detail: string): void {
  if (!process.stdout.isTTY) return;
  const width = 24;
  const safeCompleted = Math.max(0, Math.min(completed, total));
  const percent = total <= 0 ? 0 : Math.round((safeCompleted / total) * 100);
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
  const bar = `${"=".repeat(filled)}${"-".repeat(width - filled)}`;
  const line = `\r${pc.cyan("Workflow run")} ${pc.dim("[")}${pc.green(bar)}${pc.dim("]")} ${String(percent).padStart(3)}% ${pc.dim(detail)}`;
  process.stdout.write(line);
  if (safeCompleted >= total) {
    process.stdout.write("\n");
  }
}

function resolveHostedBindingValue(bindingKey: string): string | null {
  if (bindingKey !== "provider-api-key") return null;

  return "__hosted_provider__";
}

async function executeHostedPipeline(
  pipeline: DynamicRegistryPipeline,
  opts?: { json?: boolean },
): Promise<void> {
  const executionClient = createHostedExecutionClient();
  const session = readSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Hosted session expired. Run `growthub auth login` again.");
  }

  let hostedWorkflowId =
    typeof pipeline.metadata?.hostedWorkflowId === "string"
      ? pipeline.metadata.hostedWorkflowId
      : undefined;

  try {
    const saveResult = await saveHostedWorkflow(session, {
      workflowId: hostedWorkflowId,
      name:
        typeof pipeline.metadata?.workflowName === "string"
          ? pipeline.metadata.workflowName
          : inferWorkflowName(pipeline),
      description:
        typeof pipeline.metadata?.description === "string"
          ? pipeline.metadata.description
          : "",
        config: compileToHostedWorkflowConfig(pipeline),
    });
    hostedWorkflowId = saveResult?.workflowId ?? hostedWorkflowId;
  } catch (err) {
    if (!(err instanceof HostedEndpointUnavailableError)) {
      throw err;
    }
  }

  let completedNodes = 0;
  const totalNodes = Math.max(1, pipeline.nodes.length);
  const completed = new Set<string>();
  const trackableNodeIds = new Set(pipeline.nodes.map((node) => node.id));
  const startupSpinner = opts?.json ? null : p.spinner();
  let startupSettled = false;

  startupSpinner?.start("Preparing hosted workflow execution...");

  const settleStartup = (message?: string) => {
    if (!startupSpinner || startupSettled) return;
    startupSettled = true;
    startupSpinner.stop(message ?? "Hosted workflow execution started.");
  };

  const result = await executionClient.executeWorkflow({
    pipelineId: pipeline.pipelineId,
    workflowId: hostedWorkflowId,
    threadId: hostedWorkflowId ?? pipeline.threadId,
    nodes: pipeline.nodes.map((n) => ({
      nodeId: n.id,
      slug: n.slug,
      bindings: n.bindings,
      upstreamNodeIds: n.upstreamNodeIds,
    })),
    executionMode: pipeline.executionMode,
    metadata: pipeline.metadata,
  }, opts?.json ? undefined : {
    onEvent: async (event) => {
      if (event.type === "node_start" || event.type === "node_complete") {
        settleStartup("Hosted workflow execution started.");
      }
      if (
        event.type === "node_complete" &&
        event.nodeId &&
        trackableNodeIds.has(event.nodeId) &&
        !completed.has(event.nodeId)
      ) {
        completed.add(event.nodeId);
        completedNodes = completed.size;
        const node = pipeline.nodes.find((candidate) => candidate.id === event.nodeId);
        renderExecutionProgress(completedNodes, totalNodes, node?.slug ?? event.nodeId);
      }
      if (event.type === "error") {
        settleStartup("Hosted workflow execution started.");
        renderExecutionProgress(totalNodes, totalNodes, "failed");
      }
    },
  });

  settleStartup("Hosted workflow execution started.");

  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("");
  console.log(pc.bold("Pipeline Execution Result"));
  console.log(hr());
  console.log(`  ${pc.dim("Execution ID:")} ${result.executionId}`);
  if (result.threadId) console.log(`  ${pc.dim("Thread ID:")}    ${result.threadId}`);
  console.log(`  ${pc.dim("Status:")}       ${result.status === "succeeded" ? pc.green(result.status) : pc.red(result.status)}`);
  if (result.startedAt) console.log(`  ${pc.dim("Started:")}      ${result.startedAt}`);
  if (result.completedAt) console.log(`  ${pc.dim("Completed:")}    ${result.completedAt}`);
  console.log(hr());

  for (const [nodeId, nodeResult] of Object.entries(result.nodeResults)) {
    const statusColor = nodeResult.status === "succeeded" ? pc.green : pc.red;
    console.log(`  ${statusColor(nodeResult.status)} ${pc.bold(nodeResult.slug)} (${pc.dim(nodeId)})`);
    if (nodeResult.error) {
      console.log(`    ${pc.red(nodeResult.error)}`);
    }
  }

  if (result.artifacts.length > 0) {
    console.log("");
    console.log(pc.bold("  Artifacts:"));
    for (const art of result.artifacts) {
      console.log(`    ${pc.dim("·")} ${art.artifactType} (${art.artifactId})`);
    }
  }

  if (result.summary) {
    console.log("");
    console.log(pc.bold("  Summary:"));
    if (result.summary.outputText) console.log(`    ${pc.dim("·")} ${result.summary.outputText}`);
    if (typeof result.summary.imageCount === "number") console.log(`    ${pc.dim("·")} images: ${result.summary.imageCount}`);
    if (typeof result.summary.slideCount === "number") console.log(`    ${pc.dim("·")} slides: ${result.summary.slideCount}`);
    if (typeof result.summary.videoCount === "number") console.log(`    ${pc.dim("·")} videos: ${result.summary.videoCount}`);
    if (result.summary.workflowRunId) console.log(`    ${pc.dim("·")} workflow_run_id: ${result.summary.workflowRunId}`);
    if (result.summary.keyboardShortcutHint) console.log(`    ${pc.dim("·")} ${result.summary.keyboardShortcutHint}`);
  }

  try {
    const credits = await fetchHostedCredits(session);
    if (credits) {
      console.log("");
      console.log(pc.bold("  Credits:"));
      console.log(`    ${pc.dim("·")} available: $${credits.totalAvailable.toFixed(2)}`);
      console.log(`    ${pc.dim("·")} used this period: $${credits.creditsUsedThisPeriod.toFixed(2)} / $${credits.creditsPerMonth.toFixed(2)}`);
    }
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      console.log("");
      console.log(pc.yellow("  Credits unavailable on this hosted surface."));
    } else {
      throw err;
    }
  }

  const artifactStore = createArtifactStore();
  for (const artRef of result.artifacts) {
    const nodeResult = result.nodeResults[artRef.nodeId];
    artifactStore.create({
      artifactType: artRef.artifactType as "video" | "image" | "slides" | "text" | "report" | "pipeline",
      sourceNodeSlug: nodeResult?.slug ?? "unknown",
      executionContext: pipeline.executionMode === "local" ? "local" : "hosted",
      pipelineId: pipeline.pipelineId,
      nodeId: artRef.nodeId,
      threadId: result.threadId ?? pipeline.threadId,
      metadata: artRef.metadata ?? {},
    });
  }

  console.log("");
}

export { executeHostedPipeline };

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerPipelineCommands(program: Command): void {
  const pipe = program
    .command("pipeline")
    .description("Assemble, validate, and execute dynamic registry pipelines")
    .addHelpText("after", `
Examples:
  $ growthub pipeline                       # interactive assembler
  $ growthub pipeline assemble              # interactive assembly
  $ growthub pipeline validate ./pipeline.json
  $ growthub pipeline execute ./pipeline.json
`);

  pipe.action(async () => {
    await runPipelineAssembler({});
  });

  // ── assemble ────────────────────────────────────────────────────────────
  pipe
    .command("assemble")
    .description("Interactively assemble a dynamic registry pipeline")
    .action(async () => {
      await runPipelineAssembler({});
    });

  // ── validate ────────────────────────────────────────────────────────────
  pipe
    .command("validate")
    .description("Validate a pipeline from a JSON file or inline JSON")
    .argument("<file-or-json>", "Path to pipeline JSON file or inline JSON string")
    .option("--json", "Output raw JSON")
    .action(async (input: string, opts: { json?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      try {
        const pipeline = loadPipelineFromFileOrJson(input);
        const builder = createPipelineBuilder({
          executionMode: pipeline.executionMode,
          threadId: pipeline.threadId,
          metadata: pipeline.metadata,
        });

        for (const node of pipeline.nodes) {
          builder.addNode(node.slug, node.bindings, node.upstreamNodeIds);
        }

        const result = await builder.validate();

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.valid) {
          console.log(pc.green(pc.bold("Pipeline is valid.")));
        } else {
          console.log(pc.red(pc.bold("Pipeline validation failed.")));
        }

        for (const issue of result.issues) {
          const prefix = issue.severity === "error" ? pc.red("  ERROR") : pc.yellow("  WARN");
          const nodeRef = issue.nodeId ? ` [${issue.nodeId}]` : "";
          console.log(`${prefix}${nodeRef}: ${issue.message}`);
        }

        if (!result.valid) process.exitCode = 1;
      } catch (err) {
        console.error(pc.red("Validation failed: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── execute ─────────────────────────────────────────────────────────────
  pipe
    .command("execute")
    .description("Execute a pipeline from a JSON file or inline JSON")
    .argument("<file-or-json>", "Path to pipeline JSON file or inline JSON string")
    .option("--json", "Output raw JSON")
    .action(async (input: string, opts: { json?: boolean }) => {
      const access = getWorkflowAccess();
      if (access.state !== "ready") {
        console.error(pc.red(`${access.reason}.`));
        process.exitCode = 1;
        return;
      }

      try {
        const pipeline = loadPipelineFromFileOrJson(input);
        if (!opts.json) {
          const registry = createCmsCapabilityRegistryClient();
          const { nodes: capabilities } = await registry.listCapabilities({ enabledOnly: false });
          const summary = buildPreExecutionSummary({
            pipeline,
            registryBySlug: new Map(capabilities.map((node) => [node.slug, node])),
          });
          console.log("");
          console.log(box(renderPreExecutionSummary(summary)));
          console.log("");
        }
        const executionClient = createHostedExecutionClient();
        const session = readSession();
        if (!session || isSessionExpired(session)) {
          throw new Error("Hosted session expired. Run `growthub auth login` again.");
        }

        let hostedWorkflowId =
          typeof pipeline.metadata?.hostedWorkflowId === "string"
            ? pipeline.metadata.hostedWorkflowId
            : undefined;

        try {
          const saveResult = await saveHostedWorkflow(session, {
            workflowId: hostedWorkflowId,
            name:
              typeof pipeline.metadata?.workflowName === "string"
                ? pipeline.metadata.workflowName
                : inferWorkflowName(pipeline),
            description:
              typeof pipeline.metadata?.description === "string"
                ? pipeline.metadata.description
                : "",
            config: compileToHostedWorkflowConfig(pipeline),
          });
          hostedWorkflowId = saveResult?.workflowId ?? hostedWorkflowId;
        } catch (err) {
          if (!(err instanceof HostedEndpointUnavailableError)) {
            throw err;
          }
        }

        let completedNodes = 0;
        const totalNodes = Math.max(1, pipeline.nodes.length);
        const completed = new Set<string>();
        const trackableNodeIds = new Set(pipeline.nodes.map((node) => node.id));

        const result = await executionClient.executeWorkflow({
          pipelineId: pipeline.pipelineId,
          workflowId: hostedWorkflowId,
          threadId: hostedWorkflowId ?? pipeline.threadId,
          nodes: pipeline.nodes.map((n) => ({
            nodeId: n.id,
            slug: n.slug,
            bindings: n.bindings,
            upstreamNodeIds: n.upstreamNodeIds,
          })),
          executionMode: pipeline.executionMode,
          metadata: pipeline.metadata,
        }, opts.json ? undefined : {
          onEvent: async (event) => {
            if (
              event.type === "node_complete" &&
              event.nodeId &&
              trackableNodeIds.has(event.nodeId) &&
              !completed.has(event.nodeId)
            ) {
              completed.add(event.nodeId);
              completedNodes = completed.size;
              const node = pipeline.nodes.find((candidate) => candidate.id === event.nodeId);
              renderExecutionProgress(completedNodes, totalNodes, node?.slug ?? event.nodeId);
            }
            if (event.type === "error") {
              renderExecutionProgress(totalNodes, totalNodes, "failed");
            }
          },
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log("");
        console.log(pc.bold("Pipeline Execution Result"));
        console.log(hr());
        console.log(`  ${pc.dim("Execution ID:")} ${result.executionId}`);
        if (result.threadId) console.log(`  ${pc.dim("Thread ID:")}    ${result.threadId}`);
        console.log(`  ${pc.dim("Status:")}       ${result.status === "succeeded" ? pc.green(result.status) : pc.red(result.status)}`);
        if (result.startedAt) console.log(`  ${pc.dim("Started:")}      ${result.startedAt}`);
        if (result.completedAt) console.log(`  ${pc.dim("Completed:")}    ${result.completedAt}`);
        console.log(hr());

        for (const [nodeId, nodeResult] of Object.entries(result.nodeResults)) {
          const statusColor = nodeResult.status === "succeeded" ? pc.green : pc.red;
          console.log(`  ${statusColor(nodeResult.status)} ${pc.bold(nodeResult.slug)} (${pc.dim(nodeId)})`);
          if (nodeResult.error) {
            console.log(`    ${pc.red(nodeResult.error)}`);
          }
        }

        if (result.artifacts.length > 0) {
          console.log("");
          console.log(pc.bold("  Artifacts:"));
          for (const art of result.artifacts) {
            console.log(`    ${pc.dim("·")} ${art.artifactType} (${art.artifactId})`);
          }
        }

        if (result.summary) {
          console.log("");
          console.log(pc.bold("  Summary:"));
          if (result.summary.outputText) console.log(`    ${pc.dim("·")} ${result.summary.outputText}`);
          if (typeof result.summary.imageCount === "number") console.log(`    ${pc.dim("·")} images: ${result.summary.imageCount}`);
          if (typeof result.summary.slideCount === "number") console.log(`    ${pc.dim("·")} slides: ${result.summary.slideCount}`);
          if (typeof result.summary.videoCount === "number") console.log(`    ${pc.dim("·")} videos: ${result.summary.videoCount}`);
          if (result.summary.workflowRunId) console.log(`    ${pc.dim("·")} workflow_run_id: ${result.summary.workflowRunId}`);
          if (result.summary.keyboardShortcutHint) console.log(`    ${pc.dim("·")} ${result.summary.keyboardShortcutHint}`);
        }

        try {
          const credits = await fetchHostedCredits(session);
          if (credits) {
            console.log("");
            console.log(pc.bold("  Credits:"));
            console.log(`    ${pc.dim("·")} available: $${credits.totalAvailable.toFixed(2)}`);
            console.log(`    ${pc.dim("·")} used this period: $${credits.creditsUsedThisPeriod.toFixed(2)} / $${credits.creditsPerMonth.toFixed(2)}`);
          }
        } catch (err) {
          if (!(err instanceof HostedEndpointUnavailableError)) {
            throw err;
          }
        }

        // Record artifacts locally
        const artifactStore = createArtifactStore();
        for (const artRef of result.artifacts) {
          const nodeResult = result.nodeResults[artRef.nodeId];
          artifactStore.create({
            artifactType: artRef.artifactType as "video" | "image" | "slides" | "text" | "report" | "pipeline",
            sourceNodeSlug: nodeResult?.slug ?? "unknown",
            executionContext: pipeline.executionMode === "local" ? "local" : "hosted",
            pipelineId: pipeline.pipelineId,
            nodeId: artRef.nodeId,
            threadId: pipeline.threadId,
            metadata: artRef.metadata ?? {},
          });
        }

        console.log("");
      } catch (err) {
        console.error(pc.red("Execution failed: " + (err as Error).message));
        process.exitCode = 1;
      }
    });
}
