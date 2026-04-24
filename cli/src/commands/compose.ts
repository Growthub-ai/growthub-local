/**
 * CLI Commands — compose
 *
 * growthub compose new <file>        — scaffold a starter `growthub.config.mjs`
 * growthub compose validate <file>   — structurally validate a composition file
 * growthub compose preview <file>    — render the canvas grid to the terminal
 * growthub compose deploy <file>     — emit a CapabilityManifestEnvelope
 *                                      bundling the composition (local output)
 *
 * The compose surface is additive over the existing pipeline / workflow
 * / capability commands. It consumes the composability primitives
 * declared in `@growthub/api-contract/compositions` and
 * `@growthub/api-contract/widgets`, and never owns execution truth —
 * compositions reference capabilities, pipelines, artifacts, and chat
 * threads by id/slug only.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pc from "picocolors";
import { Command } from "commander";
import type {
  Composition,
  WidgetDefinition,
  CapabilityManifestEnvelope,
} from "@growthub/api-contract";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveInputPath(input: string): string {
  const resolved = path.resolve(process.cwd(), input);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Composition file not found: ${resolved}`);
  }
  return resolved;
}

async function loadComposition(filePath: string): Promise<Composition> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return coerceComposition(parsed);
  }
  if (ext === ".mjs" || ext === ".js") {
    const mod = (await import(pathToFileURL(filePath).href)) as {
      default?: unknown;
      composition?: unknown;
    };
    const candidate = mod.composition ?? mod.default;
    if (!candidate) {
      throw new Error(
        "Composition module must export either `default` or a named `composition`.",
      );
    }
    return coerceComposition(candidate);
  }
  throw new Error(
    `Unsupported composition extension: ${ext || "<none>"} (expected .json, .mjs, or .js)`,
  );
}

function coerceComposition(value: unknown): Composition {
  if (!value || typeof value !== "object") {
    throw new Error("Composition must be an object.");
  }
  const c = value as Partial<Composition>;
  if (typeof c.id !== "string" || c.id.length === 0) {
    throw new Error("Composition.id is required (non-empty string).");
  }
  if (typeof c.title !== "string" || c.title.length === 0) {
    throw new Error("Composition.title is required (non-empty string).");
  }
  if (!Array.isArray(c.widgets)) {
    throw new Error("Composition.widgets is required (array).");
  }
  return c as Composition;
}

interface CompositionIssue {
  severity: "error" | "warn";
  message: string;
  widgetId?: string;
}

function validateComposition(composition: Composition): CompositionIssue[] {
  const issues: CompositionIssue[] = [];
  const seen = new Set<string>();

  for (const widget of composition.widgets) {
    if (!widget.id) {
      issues.push({ severity: "error", message: "Widget missing `id`." });
      continue;
    }
    if (seen.has(widget.id)) {
      issues.push({
        severity: "error",
        message: `Duplicate widget id: ${widget.id}`,
        widgetId: widget.id,
      });
    }
    seen.add(widget.id);

    if (!widget.kind) {
      issues.push({
        severity: "error",
        message: "Widget missing `kind`.",
        widgetId: widget.id,
      });
    }
    if (!widget.title) {
      issues.push({
        severity: "warn",
        message: "Widget has no `title`.",
        widgetId: widget.id,
      });
    }
    const { layout } = widget;
    if (!layout) {
      issues.push({
        severity: "error",
        message: "Widget missing `layout`.",
        widgetId: widget.id,
      });
    } else {
      for (const key of ["x", "y", "w", "h"] as const) {
        if (typeof layout[key] !== "number" || layout[key] < 0) {
          issues.push({
            severity: "error",
            message: `Widget layout.${key} must be a non-negative number.`,
            widgetId: widget.id,
          });
        }
      }
    }

    const bindings = widget.bindings ?? {};
    const boundKeys = [
      bindings.capabilitySlug,
      bindings.pipelineId,
      bindings.artifactId,
      bindings.threadId,
    ].filter((v) => typeof v === "string" && v.length > 0);

    if (widget.kind !== "markdown" && widget.kind !== "custom" && boundKeys.length === 0) {
      issues.push({
        severity: "warn",
        message: `Widget of kind "${widget.kind}" has no bindings.`,
        widgetId: widget.id,
      });
    }
  }

  return issues;
}

function renderGridPreview(composition: Composition): string {
  const columns = composition.canvas?.columns ?? 12;
  const rows = Math.max(
    1,
    ...composition.widgets.map((w) => (w.layout?.y ?? 0) + (w.layout?.h ?? 1)),
  );

  const grid: string[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => pc.dim("·")),
  );

  composition.widgets.forEach((widget, idx) => {
    const tag = String.fromCharCode(65 + (idx % 26));
    const { x = 0, y = 0, w = 1, h = 1 } = widget.layout ?? {};
    for (let r = y; r < Math.min(y + h, rows); r++) {
      for (let c = x; c < Math.min(x + w, columns); c++) {
        grid[r][c] = pc.cyan(tag);
      }
    }
  });

  const rowsStr = grid.map((row) => "  " + row.join(" ")).join("\n");
  const legend = composition.widgets
    .map((widget, idx) => {
      const tag = String.fromCharCode(65 + (idx % 26));
      return `  ${pc.cyan(tag)}  ${widget.id}  ${pc.dim(widget.kind)}  ${widget.title}`;
    })
    .join("\n");

  return [rowsStr, "", pc.bold("Widgets:"), legend].join("\n");
}

function buildEnvelope(composition: Composition): CapabilityManifestEnvelope {
  return {
    version: 1,
    host: "local://compose",
    fetchedAt: new Date().toISOString(),
    source: "local-extension",
    capabilities: [],
    compositions: [composition],
    canvas: composition.canvas,
  };
}

// ---------------------------------------------------------------------------
// Starter template for `compose new`
// ---------------------------------------------------------------------------

const STARTER_CONFIG = `/**
 * growthub.config.mjs — Growthub composition manifest
 *
 * Declarative assembly of widgets, pipelines, artifacts, and
 * capabilities into a canvas/dashboard. Consumed by \`growthub compose\`
 * and rendered identically by local harnesses and the hosted UI.
 */
import {
  defineComposition,
  defineWidget,
} from "@growthub/api-contract";

export const composition = defineComposition({
  id: "starter-canvas",
  title: "Starter Canvas",
  subtitle: "Default workspace for a new Growthub kit.",
  canvas: { columns: 12, rowHeight: 80 },
  capabilities: [],
  pipelines: [],
  artifacts: [],
  widgets: [
    defineWidget({
      id: "welcome",
      kind: "markdown",
      title: "Welcome",
      layout: { x: 0, y: 0, w: 12, h: 2 },
      config: {
        body:
          "Edit \`growthub.config.mjs\` and run \`growthub compose preview\` " +
          "to iterate on your canvas.",
      },
    }),
    defineWidget({
      id: "primary-workflow",
      kind: "workflow-runner",
      title: "Primary Workflow",
      layout: { x: 0, y: 2, w: 6, h: 4 },
      bindings: {
        // Point this at a saved hosted workflow id.
        // pipelineId: "saved-workflow-id",
      },
    }),
    defineWidget({
      id: "latest-artifacts",
      kind: "artifact-viewer",
      title: "Latest Artifact",
      layout: { x: 6, y: 2, w: 6, h: 4 },
      bindings: {
        // artifactId: "art_xxx",
      },
    }),
  ],
});

export default composition;
`;

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerComposeCommands(program: Command): void {
  const compose = program
    .command("compose")
    .description(
      "Assemble widgets, pipelines, and artifacts into a canvas composition",
    )
    .addHelpText(
      "after",
      `
Examples:
  $ growthub compose new ./growthub.config.mjs
  $ growthub compose validate ./growthub.config.mjs
  $ growthub compose preview ./growthub.config.mjs
  $ growthub compose deploy ./growthub.config.mjs --output ./dist/envelope.json
`,
    );

  // ── new ─────────────────────────────────────────────────────────────────
  compose
    .command("new")
    .description("Scaffold a starter growthub.config.mjs at the given path")
    .argument("[file]", "Target path", "./growthub.config.mjs")
    .option("--force", "Overwrite an existing file", false)
    .action((file: string, opts: { force?: boolean }) => {
      const target = path.resolve(process.cwd(), file);
      if (fs.existsSync(target) && !opts.force) {
        console.error(
          pc.red(
            `Refusing to overwrite ${target}. Pass --force to replace it.`,
          ),
        );
        process.exitCode = 1;
        return;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, STARTER_CONFIG, "utf8");
      console.log(pc.green(`Wrote starter composition to ${target}.`));
      console.log(pc.dim("Next: `growthub compose preview " + file + "`."));
    });

  // ── validate ────────────────────────────────────────────────────────────
  compose
    .command("validate")
    .description("Structurally validate a composition file (.json|.mjs|.js)")
    .argument("<file>", "Path to the composition file")
    .option("--json", "Output raw JSON")
    .action(async (file: string, opts: { json?: boolean }) => {
      try {
        const resolved = resolveInputPath(file);
        const composition = await loadComposition(resolved);
        const issues = validateComposition(composition);
        const valid = issues.every((i) => i.severity !== "error");

        if (opts.json) {
          console.log(
            JSON.stringify(
              { valid, issues, compositionId: composition.id },
              null,
              2,
            ),
          );
          if (!valid) process.exitCode = 1;
          return;
        }

        if (valid) {
          console.log(pc.green(pc.bold("Composition is valid.")));
        } else {
          console.log(pc.red(pc.bold("Composition validation failed.")));
        }
        for (const issue of issues) {
          const prefix =
            issue.severity === "error" ? pc.red("  ERROR") : pc.yellow("  WARN");
          const ref = issue.widgetId ? ` [${issue.widgetId}]` : "";
          console.log(`${prefix}${ref}: ${issue.message}`);
        }
        if (!valid) process.exitCode = 1;
      } catch (err) {
        console.error(pc.red("Validation failed: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── preview ─────────────────────────────────────────────────────────────
  compose
    .command("preview")
    .description("Render the canvas grid and widget list to the terminal")
    .argument("<file>", "Path to the composition file")
    .action(async (file: string) => {
      try {
        const resolved = resolveInputPath(file);
        const composition = await loadComposition(resolved);
        console.log("");
        console.log(pc.bold(`${composition.title}`) + pc.dim(`  (${composition.id})`));
        if (composition.subtitle) {
          console.log(pc.dim(composition.subtitle));
        }
        console.log("");
        console.log(renderGridPreview(composition));
        console.log("");
      } catch (err) {
        console.error(pc.red("Preview failed: " + (err as Error).message));
        process.exitCode = 1;
      }
    });

  // ── deploy ──────────────────────────────────────────────────────────────
  compose
    .command("deploy")
    .description(
      "Emit a CapabilityManifestEnvelope bundling this composition (local output)",
    )
    .argument("<file>", "Path to the composition file")
    .option("-o, --output <path>", "Output envelope path", "./growthub.envelope.json")
    .option("--json", "Print the envelope to stdout instead of writing a file")
    .action(
      async (file: string, opts: { output?: string; json?: boolean }) => {
        try {
          const resolved = resolveInputPath(file);
          const composition = await loadComposition(resolved);
          const issues = validateComposition(composition);
          if (issues.some((i) => i.severity === "error")) {
            console.error(
              pc.red(
                "Refusing to deploy: composition has validation errors. Run `growthub compose validate` first.",
              ),
            );
            process.exitCode = 1;
            return;
          }
          const envelope = buildEnvelope(composition);
          if (opts.json) {
            console.log(JSON.stringify(envelope, null, 2));
            return;
          }
          const out = path.resolve(process.cwd(), opts.output ?? "./growthub.envelope.json");
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, JSON.stringify(envelope, null, 2), "utf8");
          console.log(pc.green(`Wrote envelope to ${out}.`));
        } catch (err) {
          console.error(pc.red("Deploy failed: " + (err as Error).message));
          process.exitCode = 1;
        }
      },
    );
}

// Exported for reuse by tests and adjacent surfaces.
export {
  loadComposition,
  validateComposition,
  renderGridPreview,
  buildEnvelope,
  STARTER_CONFIG,
};
export type { CompositionIssue };
export type { Composition, WidgetDefinition };
