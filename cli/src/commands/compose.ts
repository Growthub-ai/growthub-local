/**
 * `growthub compose` — manifest-first canvas/composition primitives.
 *
 * This command is intentionally additive: it validates and previews local
 * `growthub.config.json` composition manifests, then deploys the same plain
 * object through the existing hosted profile bridge when available.
 */

import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { Command } from "commander";
import {
  HostedEndpointUnavailableError,
  deployHostedComposition,
} from "../auth/hosted-client.js";
import { readSession, isSessionExpired } from "../auth/session-store.js";

const DEFAULT_CONFIG_PATH = "growthub.config.json";

interface ComposeValidationIssue {
  path: string;
  message: string;
}

interface ComposeValidationResult {
  valid: boolean;
  issues: ComposeValidationIssue[];
  compositionCount: number;
  widgetCount: number;
  pipelineCount: number;
  artifactCount: number;
}

export function sampleCompositionConfig(name = "Growthub Workspace Canvas"): Record<string, unknown> {
  const slug = slugify(name) || "growthub-workspace-canvas";
  const widgets = [
    {
      slug: "workspace-chat",
      type: "chat-session",
      title: "Workspace Chat",
      bindings: [{ key: "threadId", source: "trace" }],
      navigation: { openChatThreadId: "current" },
    },
    {
      slug: "workflow-runner",
      type: "workflow-runner",
      title: "Workflow Runner",
      pipelineId: "starter-pipeline",
      bindings: [{ key: "pipelineId", value: "starter-pipeline" }],
      navigation: { openWorkflowId: "starter-pipeline" },
    },
    {
      slug: "artifact-gallery",
      type: "artifact-viewer",
      title: "Artifact Gallery",
      artifactTypes: ["image", "video", "report"],
      bindings: [{ key: "artifactScope", value: "workspace" }],
    },
  ];
  return {
    schemaVersion: 1,
    source: "local-extension",
    composedAt: "1970-01-01T00:00:00.000Z",
    compositions: [
      {
        slug,
        name,
        description: "Manifest-defined canvas tying chat, workflow, and artifact primitives together.",
        widgets,
        canvas: {
          layout: {
            columns: 12,
            rowHeight: 32,
            gap: 16,
            items: [
              { widgetSlug: "workspace-chat", x: 0, y: 0, w: 4, h: 8 },
              { widgetSlug: "workflow-runner", x: 4, y: 0, w: 4, h: 8 },
              { widgetSlug: "artifact-gallery", x: 8, y: 0, w: 4, h: 8 },
            ],
          },
          widgets: widgets.map((widget) => ({ ...widget })),
        },
        pipelines: [
          {
            slug: "starter-pipeline",
            name: "Starter Pipeline",
            workflow: {
              pipelineId: "starter-pipeline",
              nodes: [],
              executionMode: "hosted",
              metadata: { source: "growthub compose" },
            },
          },
        ],
        artifacts: [
          {
            slug: "workspace-output",
            name: "Workspace Output",
            artifactType: "report",
          },
        ],
        bindings: [
          { kind: "chat-to-canvas", from: "workspace-chat", to: slug },
          { kind: "workflow-outputs-to-artifacts", from: "starter-pipeline", to: "artifact-gallery" },
        ],
        navigation: [
          { id: "open-canvas", label: "Open canvas", target: "canvas", ref: slug },
          { id: "run-workflow", label: "Run workflow", target: "workflow", ref: "starter-pipeline" },
        ],
        metadata: {
          slashCommands: ["/canvas open", "/workflow run", "/artifact attach"],
          tracePath: ".growthub-fork/trace.jsonl",
        },
      },
    ],
  };
}

export function formatCompositionConfig(
  config: Record<string, unknown>,
  format: "json" | "ts",
): string {
  const json = JSON.stringify(config, null, 2);
  if (format === "json") return `${json}\n`;
  return [
    'import type { CompositionManifestEnvelope } from "@growthub/api-contract/compositions";',
    "",
    `export default ${json} satisfies CompositionManifestEnvelope;`,
    "",
  ].join("\n");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function loadCompositionConfig(filePath: string): unknown {
  const resolved = path.resolve(filePath);
  const content = fs.readFileSync(resolved, "utf8");
  if (resolved.endsWith(".ts")) {
    const withoutImports = content.replace(/^import\s+type\s+[^;]+;\s*$/gm, "").trim();
    const match = withoutImports.match(/^export\s+default\s+([\s\S]+?)\s+satisfies\s+[^;]+;\s*$/);
    if (!match) {
      throw new Error("TypeScript composition configs must use `export default <json> satisfies ...;`.");
    }
    return JSON.parse(match[1]);
  }
  return JSON.parse(content);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function validateCompositionConfig(value: unknown): ComposeValidationResult {
  const issues: ComposeValidationIssue[] = [];
  const root = asRecord(value);
  if (!root) {
    return {
      valid: false,
      issues: [{ path: "$", message: "Config must be a JSON object." }],
      compositionCount: 0,
      widgetCount: 0,
      pipelineCount: 0,
      artifactCount: 0,
    };
  }

  const compositions = Array.isArray(root.compositions) ? root.compositions : [];
  if (!Array.isArray(root.compositions)) {
    issues.push({ path: "$.compositions", message: "Expected an array of compositions." });
  }
  if (compositions.length === 0) {
    issues.push({ path: "$.compositions", message: "At least one composition is required." });
  }

  let widgetCount = 0;
  let pipelineCount = 0;
  let artifactCount = 0;

  compositions.forEach((rawComposition, compositionIndex) => {
    const composition = asRecord(rawComposition);
    const basePath = `$.compositions[${compositionIndex}]`;
    if (!composition) {
      issues.push({ path: basePath, message: "Composition must be an object." });
      return;
    }

    for (const field of ["slug", "name"]) {
      if (typeof composition[field] !== "string" || !String(composition[field]).trim()) {
        issues.push({ path: `${basePath}.${field}`, message: "Expected a non-empty string." });
      }
    }

    const widgets = Array.isArray(composition.widgets) ? composition.widgets : [];
    if (!Array.isArray(composition.widgets)) {
      issues.push({ path: `${basePath}.widgets`, message: "Expected an array of widgets." });
    }
    if (widgets.length === 0) {
      issues.push({ path: `${basePath}.widgets`, message: "At least one widget is required." });
    }
    widgetCount += widgets.length;

    const widgetSlugs = new Set<string>();
    widgets.forEach((rawWidget, widgetIndex) => {
      const widget = asRecord(rawWidget);
      const widgetPath = `${basePath}.widgets[${widgetIndex}]`;
      if (!widget) {
        issues.push({ path: widgetPath, message: "Widget must be an object." });
        return;
      }
      for (const field of ["slug", "type", "title"]) {
        if (typeof widget[field] !== "string" || !String(widget[field]).trim()) {
          issues.push({ path: `${widgetPath}.${field}`, message: "Expected a non-empty string." });
        }
      }
      if (typeof widget.slug === "string") widgetSlugs.add(widget.slug);
    });

    const canvas = asRecord(composition.canvas);
    if (canvas) {
      const layout = asRecord(canvas.layout);
      if (!layout) {
        issues.push({ path: `${basePath}.canvas.layout`, message: "Canvas layout must be an object." });
      } else {
        const items = Array.isArray(layout.items) ? layout.items : [];
        if (!Array.isArray(layout.items)) {
          issues.push({ path: `${basePath}.canvas.layout.items`, message: "Expected an array of grid items." });
        }
        for (const [itemIndex, rawItem] of items.entries()) {
          const item = asRecord(rawItem);
          const itemPath = `${basePath}.canvas.layout.items[${itemIndex}]`;
          if (!item) {
            issues.push({ path: itemPath, message: "Grid item must be an object." });
            continue;
          }
          if (typeof item.widgetSlug !== "string" || !widgetSlugs.has(item.widgetSlug)) {
            issues.push({ path: `${itemPath}.widgetSlug`, message: "Grid item must reference a declared widget slug." });
          }
          for (const field of ["x", "y", "w", "h"]) {
            if (typeof item[field] !== "number") {
              issues.push({ path: `${itemPath}.${field}`, message: "Expected a number." });
            }
          }
        }
      }
    }

    const pipelines = Array.isArray(composition.pipelines) ? composition.pipelines : [];
    const artifacts = Array.isArray(composition.artifacts) ? composition.artifacts : [];
    pipelineCount += pipelines.length;
    artifactCount += artifacts.length;
  });

  return {
    valid: issues.length === 0,
    issues,
    compositionCount: compositions.length,
    widgetCount,
    pipelineCount,
    artifactCount,
  };
}

function printValidationResult(result: ComposeValidationResult): void {
  if (result.valid) {
    console.log(pc.green(pc.bold("Composition config is valid.")));
  } else {
    console.log(pc.red(pc.bold("Composition config is invalid.")));
  }
  console.log(
    [
      `  compositions: ${result.compositionCount}`,
      `  widgets:      ${result.widgetCount}`,
      `  pipelines:    ${result.pipelineCount}`,
      `  artifacts:    ${result.artifactCount}`,
    ].join("\n"),
  );
  for (const issue of result.issues) {
    console.log(`${pc.red("  ERROR")} ${issue.path}: ${issue.message}`);
  }
}

function printPreview(config: unknown): void {
  const root = asRecord(config);
  const compositions = Array.isArray(root?.compositions) ? root.compositions : [];
  console.log(pc.bold("Growthub Composition Preview"));
  console.log(pc.dim("─".repeat(72)));
  for (const rawComposition of compositions) {
    const composition = asRecord(rawComposition);
    if (!composition) continue;
    const widgets = Array.isArray(composition.widgets) ? composition.widgets : [];
    const pipelines = Array.isArray(composition.pipelines) ? composition.pipelines : [];
    const artifacts = Array.isArray(composition.artifacts) ? composition.artifacts : [];
    console.log(`${pc.bold(String(composition.name ?? composition.slug))} ${pc.dim(String(composition.slug ?? ""))}`);
    if (composition.description) console.log(`  ${pc.dim(String(composition.description))}`);
    console.log(`  widgets=${widgets.length} pipelines=${pipelines.length} artifacts=${artifacts.length}`);
    for (const rawWidget of widgets) {
      const widget = asRecord(rawWidget);
      if (!widget) continue;
      console.log(`    ${pc.dim("·")} ${String(widget.type)} ${pc.bold(String(widget.title ?? widget.slug))} ${pc.dim(String(widget.slug ?? ""))}`);
    }
    console.log("");
  }
}

export function registerComposeCommands(program: Command): void {
  const compose = program
    .command("compose")
    .description("Create, validate, preview, and deploy manifest-defined canvas compositions")
    .addHelpText("after", `
Examples:
  $ growthub compose new --out growthub.config.json
  $ growthub compose validate growthub.config.json
  $ growthub compose preview growthub.config.json
  $ growthub compose deploy growthub.config.json
`);

  compose
    .command("new")
    .description("Create a starter composition config")
    .option("--out <path>", "Output config path", DEFAULT_CONFIG_PATH)
    .option("--name <name>", "Composition name", "Growthub Workspace Canvas")
    .option("--force", "Overwrite an existing output file")
    .action((opts: { out: string; name: string; force?: boolean }) => {
      const outPath = path.resolve(opts.out);
      if (fs.existsSync(outPath) && !opts.force) {
        console.error(pc.red(`${opts.out} already exists. Pass --force to overwrite.`));
        process.exitCode = 1;
        return;
      }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `${JSON.stringify(sampleCompositionConfig(opts.name), null, 2)}\n`);
      console.log(pc.green(`Wrote ${opts.out}`));
    });

  compose
    .command("validate")
    .description("Validate a composition config")
    .argument("[file]", "Path to composition config", DEFAULT_CONFIG_PATH)
    .option("--json", "Output raw JSON")
    .action((file: string, opts: { json?: boolean }) => {
      try {
        const config = loadCompositionConfig(file);
        const result = validateCompositionConfig(config);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printValidationResult(result);
        }
        if (!result.valid) process.exitCode = 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (opts.json) console.log(JSON.stringify({ valid: false, error: message }, null, 2));
        else console.error(pc.red(`Validation failed: ${message}`));
        process.exitCode = 1;
      }
    });

  compose
    .command("preview")
    .description("Print a local preview summary for a composition config")
    .argument("[file]", "Path to composition config", DEFAULT_CONFIG_PATH)
    .option("--json", "Output raw JSON")
    .action((file: string, opts: { json?: boolean }) => {
      try {
        const config = loadCompositionConfig(file);
        const result = validateCompositionConfig(config);
        if (!result.valid) {
          if (opts.json) console.log(JSON.stringify({ status: "invalid", validation: result }, null, 2));
          else printValidationResult(result);
          process.exitCode = 1;
          return;
        }
        if (opts.json) {
          console.log(JSON.stringify({ status: "ok", validation: result, config }, null, 2));
          return;
        }
        printPreview(config);
      } catch (err) {
        console.error(pc.red(`Preview failed: ${err instanceof Error ? err.message : String(err)}`));
        process.exitCode = 1;
      }
    });

  compose
    .command("deploy")
    .description("Deploy a composition config through the hosted profile bridge")
    .argument("[file]", "Path to composition config", DEFAULT_CONFIG_PATH)
    .option("--json", "Output raw JSON")
    .action(async (file: string, opts: { json?: boolean }) => {
      try {
        const config = loadCompositionConfig(file);
        const validation = validateCompositionConfig(config);
        if (!validation.valid) {
          if (opts.json) console.log(JSON.stringify({ status: "invalid", validation }, null, 2));
          else printValidationResult(validation);
          process.exitCode = 1;
          return;
        }

        const session = readSession();
        if (!session || isSessionExpired(session)) {
          throw new Error("Hosted session expired. Run `growthub auth login` before compose deploy.");
        }

        const result = await deployHostedComposition(session, {
          manifest: config as Record<string, unknown>,
          name: path.basename(path.resolve(file)),
        });

        if (opts.json) {
          console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
          return;
        }
        console.log(pc.green(pc.bold("Composition deployed.")));
        if (result?.compositionId) console.log(`  compositionId: ${pc.cyan(result.compositionId)}`);
        if (result?.version !== undefined) console.log(`  version:       ${result.version}`);
        if (result?.url) console.log(`  url:           ${pc.cyan(result.url)}`);
      } catch (err) {
        const message = err instanceof HostedEndpointUnavailableError
          ? "Hosted composition deploy endpoint is unavailable on this Growthub surface."
          : err instanceof Error ? err.message : String(err);
        if (opts.json) console.log(JSON.stringify({ status: "error", error: message }, null, 2));
        else console.error(pc.red(`Deploy failed: ${message}`));
        process.exitCode = 1;
      }
    });
}
