/**
 * CLI Commands — compose
 *
 * `growthub compose` is the consumer surface for the SDK's
 * `Composition` + `CanvasDefinition` + `WidgetDefinition` primitives
 * (`@growthub/api-contract/compositions` + `/widgets`). It lets a
 * governed-workspace operator scaffold, validate, and snapshot a
 * Twenty-style widget grid manifest from any kit root.
 *
 * Subcommands
 * -----------
 *
 *   - `compose new`     — interactively scaffold a starter
 *                         `growthub.config.json` with a default
 *                         canvas (workspace summary + agent-native
 *                         widgets) inside the current working
 *                         directory.
 *   - `compose preview` — load `./growthub.config.json` (or
 *                         `--file <path>`), validate the manifest
 *                         shape, and print a summary table.
 *   - `compose deploy`  — local-only snapshot: write the validated
 *                         manifest to
 *                         `.growthub-fork/compositions/<id>.json`,
 *                         the governed-workspace primitive #3 path
 *                         declared in the root `AGENTS.md`. Hosted-
 *                         bridge sync follows in a subsequent
 *                         release; this surface stays additive and
 *                         safe-by-default.
 *
 * Safety / determinism
 * --------------------
 *
 *   - The CLI does NOT execute user code. The contract is JSON. Kits
 *     may also ship a `growthub.config.ts` for in-app type safety
 *     (Next.js / Vite bundles it natively), but the CLI works off
 *     the JSON twin.
 *   - The CLI does NOT generate composition / widget ids. Users
 *     supply ids explicitly so manifests stay diffable across
 *     fork-sync drift detection runs
 *     (`cli/src/kits/fork-sync.ts::detectKitForkDrift`).
 *   - All writes are confined to `cwd` and `.growthub-fork/` — no
 *     network, no global state, no hosted-bridge calls.
 */

import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";

import type {
  Composition,
  CanvasDefinition,
  WidgetDefinition,
} from "@growthub/api-contract/compositions";
import {
  defineComposition,
  defineCanvas,
  defineWidget,
} from "@growthub/api-contract/compositions";
import { COMPOSITIONS_CONTRACT_VERSION } from "@growthub/api-contract/compositions";
import { WIDGETS_CONTRACT_VERSION } from "@growthub/api-contract/widgets";

const DEFAULT_FILENAME = "growthub.config.json";
const FORK_DIR = ".growthub-fork";
const COMPOSITIONS_SUBDIR = "compositions";

interface PreviewOptions {
  file?: string;
  json?: boolean;
}

interface NewOptions {
  id?: string;
  name?: string;
  out?: string;
  force?: boolean;
}

interface DeployOptions {
  file?: string;
  forkDir?: string;
  json?: boolean;
}

/**
 * Build a starter composition with a default workspace canvas.
 * Widgets cover the four agent-native + Twenty-parity kinds so a
 * fresh kit demonstrates cross-primitive composability out of the
 * box. The shape returned matches the SDK contract verbatim — no
 * SDK fields are invented here.
 */
export function buildStarterComposition(id: string, name: string): Composition {
  const widgets: WidgetDefinition[] = [
    defineWidget({
      id: "metrics-overview",
      kind: "chart-metric",
      title: "Workspace metrics",
      chart: "number",
      aggregate: "sum",
      slug: "agencyMetric",
      position: { x: 0, y: 0, w: 3, h: 2 },
    }),
    defineWidget({
      id: "live-integrations",
      kind: "integration-card",
      title: "Live integrations",
      slug: "bridge",
      position: { x: 3, y: 0, w: 3, h: 2 },
      bindings: { adapter: "growthub-bridge" },
    }),
    defineWidget({
      id: "agent-chat",
      kind: "chat-session",
      title: "Agent chat",
      position: { x: 6, y: 0, w: 3, h: 4 },
    }),
    defineWidget({
      id: "workflow-runner",
      kind: "workflow-runner",
      title: "Pipeline runner",
      position: { x: 9, y: 0, w: 3, h: 4 },
    }),
    defineWidget({
      id: "recent-artifacts",
      kind: "artifact-viewer",
      title: "Recent artifacts",
      mediaPreview: true,
      position: { x: 0, y: 2, w: 6, h: 2 },
    }),
  ];

  const canvas: CanvasDefinition = defineCanvas({
    id: "default",
    name: "Workspace dashboard",
    scope: "workspace",
    layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
    widgets,
    bindings: {
      chatToCanvas: true,
      workflowOutputsToArtifacts: true,
      sessionContext: true,
      portalCapabilities: true,
    },
  });

  return defineComposition({
    id,
    name,
    description:
      "Starter composition emitted by `growthub compose new`. Widgets bind to the kit's portal capabilities and integration catalog; replace ids and bindings to tailor to your kit.",
    capabilities: [],
    pipelines: [],
    integrations: [],
    canvas,
    provenance: {
      createdBy: "cli",
      createdAt: new Date().toISOString(),
      note: "growthub compose new",
    },
  });
}

function readManifest(filePath: string): Composition {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Composition manifest not found at ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ${filePath}: ${message}`);
  }
  return assertComposition(parsed, filePath);
}

/**
 * Structural validation. Mirrors the SDK contract; emits a
 * deterministic error tail so failures are easy to grep.
 */
export function assertComposition(value: unknown, source: string): Composition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source}: composition must be a JSON object`);
  }
  const comp = value as Partial<Composition>;
  if (!comp.id || typeof comp.id !== "string") {
    throw new Error(`${source}: composition.id is required (string)`);
  }
  if (comp.canvas) {
    if (typeof comp.canvas !== "object" || Array.isArray(comp.canvas)) {
      throw new Error(`${source}: composition.canvas must be an object`);
    }
    const canvas = comp.canvas as Partial<CanvasDefinition>;
    if (!canvas.id || typeof canvas.id !== "string") {
      throw new Error(`${source}: composition.canvas.id is required (string)`);
    }
    if (!canvas.layout || typeof canvas.layout.columns !== "number") {
      throw new Error(
        `${source}: composition.canvas.layout.columns is required (number)`,
      );
    }
    if (!Array.isArray(canvas.widgets)) {
      throw new Error(`${source}: composition.canvas.widgets must be an array`);
    }
    canvas.widgets.forEach((widget, index) => {
      const w = widget as Partial<WidgetDefinition>;
      if (!w.id || typeof w.id !== "string") {
        throw new Error(`${source}: canvas.widgets[${index}].id is required`);
      }
      if (!w.kind || typeof w.kind !== "string") {
        throw new Error(`${source}: canvas.widgets[${index}].kind is required`);
      }
      if (
        !w.position ||
        typeof w.position.x !== "number" ||
        typeof w.position.y !== "number" ||
        typeof w.position.w !== "number" ||
        typeof w.position.h !== "number"
      ) {
        throw new Error(
          `${source}: canvas.widgets[${index}].position must include x,y,w,h numbers`,
        );
      }
    });
  }
  return comp as Composition;
}

function summarizeComposition(comp: Composition): string[] {
  const lines: string[] = [];
  lines.push(`${pc.bold("composition")}  ${comp.id}`);
  if (comp.name) lines.push(`${pc.dim("name")}         ${comp.name}`);
  if (comp.description) {
    lines.push(`${pc.dim("description")}  ${comp.description}`);
  }
  lines.push(
    `${pc.dim("capabilities")} ${(comp.capabilities ?? []).length} declared`,
  );
  lines.push(
    `${pc.dim("integrations")} ${(comp.integrations ?? []).length} declared`,
  );
  lines.push(
    `${pc.dim("pipelines")}    ${(comp.pipelines ?? []).length} declared`,
  );
  lines.push(
    `${pc.dim("objects")}      ${(comp.objects ?? []).length} declared`,
  );
  if (comp.canvas) {
    const widgetCount = comp.canvas.widgets.length;
    const cols = comp.canvas.layout.columns;
    lines.push(
      `${pc.dim("canvas")}       ${comp.canvas.id} — ${widgetCount} widget${
        widgetCount === 1 ? "" : "s"
      } on ${cols}-col grid`,
    );
    for (const widget of comp.canvas.widgets) {
      const pos = widget.position;
      lines.push(
        `  ${pc.cyan("·")} ${pc.bold(widget.id)} ${pc.dim(`(${widget.kind})`)} @ ${pos.x},${pos.y} ${pos.w}x${pos.h}`,
      );
    }
  } else {
    lines.push(`${pc.dim("canvas")}       (none)`);
  }
  lines.push(
    pc.dim(
      `contract     compositions=v${COMPOSITIONS_CONTRACT_VERSION} widgets=v${WIDGETS_CONTRACT_VERSION}`,
    ),
  );
  return lines;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function isCancel(value: unknown): boolean {
  return typeof value === "symbol" || p.isCancel(value);
}

async function runComposeNew(options: NewOptions): Promise<void> {
  p.intro(pc.bold("growthub compose new"));

  const cwd = process.cwd();
  const outPath = path.resolve(cwd, options.out?.trim() || DEFAULT_FILENAME);

  if (fs.existsSync(outPath) && !options.force) {
    p.cancel(
      `${path.relative(cwd, outPath) || outPath} already exists. Re-run with --force to overwrite.`,
    );
    process.exitCode = 1;
    return;
  }

  let id = options.id?.trim();
  if (!id) {
    const answer = await p.text({
      message: "Composition id?",
      placeholder: "agency-portal-default",
      validate: (value) => {
        if (!value || !value.trim()) return "id is required";
        if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
          return "id must be lowercase letters, digits, hyphen";
        }
        return undefined;
      },
    });
    if (isCancel(answer)) {
      p.cancel("cancelled");
      process.exitCode = 1;
      return;
    }
    id = String(answer).trim();
  }

  let name = options.name?.trim();
  if (!name) {
    const answer = await p.text({
      message: "Composition display name?",
      placeholder: "Agency Portal Dashboard",
      defaultValue: id,
    });
    if (isCancel(answer)) {
      p.cancel("cancelled");
      process.exitCode = 1;
      return;
    }
    name = String(answer).trim() || id;
  }

  const comp = buildStarterComposition(id, name);
  fs.writeFileSync(outPath, `${JSON.stringify(comp, null, 2)}\n`, "utf8");

  p.note(
    summarizeComposition(comp).join("\n"),
    pc.green(path.relative(cwd, outPath) || outPath),
  );
  p.outro(
    `${pc.green("✓")} wrote ${pc.bold(path.relative(cwd, outPath) || outPath)}. Run ${pc.cyan("growthub compose preview")} next.`,
  );
}

function resolveManifestPath(file?: string): string {
  return path.resolve(process.cwd(), file?.trim() || DEFAULT_FILENAME);
}

async function runComposePreview(options: PreviewOptions): Promise<void> {
  const filePath = resolveManifestPath(options.file);
  let comp: Composition;
  try {
    comp = readManifest(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: message }));
    } else {
      console.error(pc.red(message));
    }
    process.exitCode = 1;
    return;
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          file: filePath,
          contract: {
            compositions: COMPOSITIONS_CONTRACT_VERSION,
            widgets: WIDGETS_CONTRACT_VERSION,
          },
          composition: comp,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(pc.bold("growthub compose preview"));
  console.log(pc.dim(filePath));
  console.log("");
  for (const line of summarizeComposition(comp)) {
    console.log(line);
  }
  console.log("");
  console.log(
    pc.green("✓"),
    "manifest is structurally valid against the v1 widget + composition contract.",
  );
}

async function runComposeDeploy(options: DeployOptions): Promise<void> {
  const filePath = resolveManifestPath(options.file);
  let comp: Composition;
  try {
    comp = readManifest(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: message }));
    } else {
      console.error(pc.red(message));
    }
    process.exitCode = 1;
    return;
  }

  const cwd = process.cwd();
  const forkDir = path.resolve(cwd, options.forkDir?.trim() || FORK_DIR);
  const compositionsDir = path.join(forkDir, COMPOSITIONS_SUBDIR);
  ensureDir(compositionsDir);
  const targetPath = path.join(compositionsDir, `${comp.id}.json`);

  const snapshot = {
    schemaVersion: COMPOSITIONS_CONTRACT_VERSION,
    widgetsContractVersion: WIDGETS_CONTRACT_VERSION,
    snapshotAt: new Date().toISOString(),
    sourceFile: path.relative(cwd, filePath) || filePath,
    composition: comp,
  };

  fs.writeFileSync(targetPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          target: targetPath,
          relative: path.relative(cwd, targetPath),
          composition: comp.id,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(pc.bold("growthub compose deploy"));
  console.log(
    `${pc.green("✓")} snapshotted ${pc.bold(comp.id)} → ${pc.cyan(path.relative(cwd, targetPath) || targetPath)}`,
  );
  console.log(
    pc.dim(
      "  hosted-bridge sync is intentionally out of scope for this release; the snapshot stays local under .growthub-fork/.",
    ),
  );
}

export function registerComposeCommands(program: Command): void {
  const compose = program
    .command("compose")
    .description(
      "Twenty-style widget grid + composition manifests for governed worker kits (SDK v1 contract).",
    )
    .addHelpText(
      "after",
      `
Examples:
  $ growthub compose new --id agency-portal-default
  $ growthub compose preview
  $ growthub compose deploy
`,
    );

  compose
    .command("new")
    .description(
      "Scaffold a starter growthub.config.json with a default workspace canvas.",
    )
    .option("--id <id>", "Composition id (lowercase letters, digits, hyphen)")
    .option("--name <name>", "Composition display name")
    .option("--out <path>", "Output filename (default: growthub.config.json)")
    .option("--force", "Overwrite an existing manifest", false)
    .action(async (options: NewOptions) => {
      await runComposeNew(options);
    });

  compose
    .command("preview")
    .description(
      "Load and structurally validate a composition manifest against the SDK v1 contract.",
    )
    .option(
      "--file <path>",
      "Path to composition manifest (default: growthub.config.json)",
    )
    .option("--json", "Output raw JSON")
    .action(async (options: PreviewOptions) => {
      await runComposePreview(options);
    });

  compose
    .command("deploy")
    .description(
      "Snapshot the composition to .growthub-fork/compositions/<id>.json (local only).",
    )
    .option(
      "--file <path>",
      "Path to composition manifest (default: growthub.config.json)",
    )
    .option(
      "--fork-dir <path>",
      "Override the fork directory (default: .growthub-fork)",
    )
    .option("--json", "Output raw JSON")
    .action(async (options: DeployOptions) => {
      await runComposeDeploy(options);
    });
}
