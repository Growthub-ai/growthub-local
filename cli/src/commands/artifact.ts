/**
 * CLI Commands — artifact
 *
 * growthub artifact list         — List standardized artifacts
 * growthub artifact inspect      — Inspect a specific artifact
 * growthub artifact download     — Download a hosted artifact through Growthub auth
 *
 * Artifacts are produced by dynamic registry pipeline executions and
 * persisted locally under ~/.paperclip/artifacts/.
 */

import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { Command } from "commander";
import {
  createArtifactStore,
  type GrowthubArtifactManifest,
  type GrowthubArtifactType,
} from "../runtime/artifact-contracts/index.js";
import {
  readExecutionResult,
} from "../runtime/execution-results/index.js";
import { readSession, isSessionExpired } from "../auth/session-store.js";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

const ARTIFACT_TYPE_CONFIG: Record<string, { color: (s: string) => string; emoji: string }> = {
  video:    { color: pc.magenta, emoji: "🎬" },
  image:    { color: pc.cyan,    emoji: "🖼️ " },
  slides:   { color: pc.yellow,  emoji: "📊" },
  text:     { color: pc.green,   emoji: "📝" },
  report:   { color: pc.blue,    emoji: "📋" },
  pipeline: { color: pc.red,     emoji: "🔗" },
};

function artifactTypeBadge(type: string): string {
  const cfg = ARTIFACT_TYPE_CONFIG[type];
  if (!cfg) return type;
  return cfg.color(`${cfg.emoji} ${type}`);
}

function statusColor(status: string): string {
  if (status === "ready") return pc.green(status);
  if (status === "generating" || status === "pending") return pc.yellow(status);
  if (status === "failed") return pc.red(status);
  if (status === "archived") return pc.dim(status);
  return status;
}

function printArtifactTable(artifacts: GrowthubArtifactManifest[]): void {
  console.log("");
  console.log(
    pc.bold("Pipeline Artifacts") +
    pc.dim(`  ${artifacts.length} artifact${artifacts.length !== 1 ? "s" : ""}`),
  );
  console.log(hr());

  if (artifacts.length === 0) {
    console.log(pc.dim("  No artifacts found."));
    console.log(pc.dim("  Run `growthub pipeline execute` to produce artifacts."));
    console.log("");
    return;
  }

  for (const art of artifacts) {
    const badge = artifactTypeBadge(art.artifactType);
    const status = statusColor(art.status);

    console.log(
      `  ${badge}  ${pc.bold(art.id)}  ${status}` +
      `  ${pc.dim(art.sourceNodeSlug)}  ${pc.dim(art.executionContext)}`,
    );
    if (art.pipelineId) {
      console.log(`    ${pc.dim("Pipeline:")} ${art.pipelineId}`);
    }
    console.log(`    ${pc.dim("Created:")} ${art.createdAt}`);
    console.log("");
  }

  console.log(hr());
  console.log(pc.dim("  growthub artifact inspect <id>  ·  growthub artifact list --type <type>"));
  console.log("");
}

function printArtifactDetail(art: GrowthubArtifactManifest): void {
  console.log("");
  console.log(pc.bold("Artifact: " + art.id));
  console.log(hr());

  const kv = (label: string, value: string | undefined) => {
    if (value === undefined) return;
    console.log(`  ${pc.bold(label.padEnd(22))} ${value}`);
  };

  kv("Type:", artifactTypeBadge(art.artifactType));
  kv("Status:", statusColor(art.status));
  kv("Source Node:", art.sourceNodeSlug);
  kv("Execution Context:", art.executionContext);
  kv("Pipeline ID:", art.pipelineId);
  kv("Node ID:", art.nodeId);
  kv("Thread ID:", art.threadId);
  kv("Connection ID:", art.createdByConnectionId);
  kv("Created:", art.createdAt);
  kv("Updated:", art.updatedAt);

  if (art.metadata && Object.keys(art.metadata).length > 0) {
    console.log("");
    console.log(pc.bold("  Metadata:"));
    console.log("  " + JSON.stringify(art.metadata, null, 2).split("\n").join("\n  "));
  }

  console.log(hr());
  console.log("");
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function inferOutPath(storagePath: string, out?: string): string {
  if (out?.trim()) return path.resolve(out);
  return path.resolve(process.cwd(), path.basename(storagePath));
}

async function downloadStoragePath(storagePath: string, outPath: string, bucket = "node_documents"): Promise<number> {
  const session = readSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Hosted session expired. Run `growthub auth login` again.");
  }

  const url = new URL("/api/secure-image", `${session.hostedBaseUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("bucket", bucket);
  url.searchParams.set("path", storagePath);

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      ...(session.userId ? { "x-user-id": session.userId } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Authenticated artifact download failed (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
  return buffer.length;
}

function resolveStorageRef(id: string | undefined, artifactSelector?: string, direct?: { storagePath?: string; bucket?: string }): {
  storagePath: string;
  bucket: string;
  artifactId: string;
} | null {
  if (direct?.storagePath?.trim()) {
    return {
      storagePath: direct.storagePath.trim(),
      bucket: direct.bucket?.trim() || "node_documents",
      artifactId: direct.storagePath.trim(),
    };
  }

  if (!id) return null;

  const execution = readExecutionResult(id);
  if (execution) {
    const artifacts = execution.artifacts.filter((artifact) => artifact.storagePath);
    const selected = artifactSelector
      ? artifacts.find((artifact) => artifact.artifactId === artifactSelector || artifact.nodeId === artifactSelector)
      : artifacts[0];
    if (!selected?.storagePath) return null;
    return {
      storagePath: selected.storagePath,
      bucket: stringMetadata(selected.metadata?.bucket) ?? "node_documents",
      artifactId: selected.artifactId,
    };
  }

  const artifact = createArtifactStore().get(id);
  const storagePath = stringMetadata(artifact?.metadata?.storagePath) ?? stringMetadata(artifact?.metadata?.storage_path);
  if (!artifact || !storagePath) return null;
  return {
    storagePath,
    bucket: stringMetadata(artifact.metadata?.bucket) ?? "node_documents",
    artifactId: artifact.id,
  };
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerArtifactCommands(program: Command): void {
  const art = program
    .command("artifact")
    .description("List and inspect pipeline execution artifacts")
    .addHelpText("after", `
Examples:
  $ growthub artifact list                  # all artifacts
  $ growthub artifact list --type video     # filter by type
  $ growthub artifact list --pipeline <id>  # filter by pipeline
  $ growthub artifact list --json           # machine-readable output
  $ growthub artifact inspect <id>          # inspect a specific artifact
  $ growthub artifact download <executionId>
  $ growthub artifact download --storage-path workflow_videos/<user>/<thread>/<file>.mp4
`);

  // Default — list
  art.action(async (opts: { json?: boolean }) => {
    const store = createArtifactStore();
    const { artifacts, meta } = store.list();

    if (opts.json) {
      console.log(JSON.stringify({ artifacts, meta }, null, 2));
      return;
    }

    printArtifactTable(artifacts);
  });

  // ── list ────────────────────────────────────────────────────────────────
  art
    .command("list")
    .description("List all pipeline execution artifacts")
    .option("--type <type>", "Filter by artifact type (video, image, slides, text, report, pipeline)")
    .option("--pipeline <id>", "Filter by pipeline ID")
    .option("--status <status>", "Filter by status (pending, generating, ready, failed, archived)")
    .option("--limit <n>", "Limit results", (v) => Number(v))
    .option("--json", "Output raw JSON for scripting")
    .action((opts: { type?: string; pipeline?: string; status?: string; limit?: number; json?: boolean }) => {
      const store = createArtifactStore();
      const { artifacts, meta } = store.list({
        artifactType: opts.type as GrowthubArtifactType | undefined,
        pipelineId: opts.pipeline,
        status: opts.status as "pending" | "generating" | "ready" | "failed" | "archived" | undefined,
        limit: opts.limit,
      });

      if (opts.json) {
        console.log(JSON.stringify({ artifacts, meta }, null, 2));
        return;
      }

      printArtifactTable(artifacts);
      console.log(pc.dim(`  Store: ${store.getStorePath()}  ·  Source: ${meta.source}`));
      console.log("");
    });

  // ── inspect ─────────────────────────────────────────────────────────────
  art
    .command("inspect")
    .description("Inspect a specific pipeline artifact")
    .argument("<id>", "Artifact ID (e.g. art_xxxxxxxxxxxx)")
    .option("--json", "Output raw JSON")
    .action((artifactId: string, opts: { json?: boolean }) => {
      const store = createArtifactStore();
      const artifact = store.get(artifactId);

      if (!artifact) {
        console.error(pc.red(`Artifact not found: "${artifactId}".`) + pc.dim(" Run `growthub artifact list` to browse."));
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(artifact, null, 2));
        return;
      }

      printArtifactDetail(artifact);
    });

  // ── download ────────────────────────────────────────────────────────────
  art
    .command("download")
    .description("Download a hosted execution artifact through the authenticated Growthub proxy")
    .argument("[id]", "Execution ID from pipeline execute, or local artifact ID")
    .option("--artifact <id>", "Artifact ID or node ID when an execution has multiple artifacts")
    .option("--storage-path <path>", "Download this Growthub storage path directly with the active auth session")
    .option("--bucket <bucket>", "Storage bucket for --storage-path", "node_documents")
    .option("--out <path>", "Output file path")
    .option("--json", "Output raw JSON")
    .action(async (id: string | undefined, opts: {
      artifact?: string;
      storagePath?: string;
      bucket?: string;
      out?: string;
      json?: boolean;
    }) => {
      try {
        const ref = resolveStorageRef(id, opts.artifact, {
          storagePath: opts.storagePath,
          bucket: opts.bucket,
        });
        if (!ref) {
          throw new Error(
            id
              ? `No downloadable storagePath found for "${id}".`
              : "Provide an execution ID, local artifact ID, or --storage-path.",
          );
        }
        const outPath = inferOutPath(ref.storagePath, opts.out);
        const bytes = await downloadStoragePath(ref.storagePath, outPath, ref.bucket);
        const payload = {
          status: "ok",
          id,
          artifactId: ref.artifactId,
          bucket: ref.bucket,
          storagePath: ref.storagePath,
          outPath,
          bytes,
        };

        if (opts.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }

        console.log(pc.green("Downloaded artifact"));
        console.log(`  ${pc.dim("Artifact:")} ${payload.artifactId}`);
        console.log(`  ${pc.dim("Storage:")}  ${payload.bucket}/${payload.storagePath}`);
        console.log(`  ${pc.dim("Output:")}   ${payload.outPath}`);
        console.log(`  ${pc.dim("Bytes:")}    ${payload.bytes}`);
      } catch (err) {
        if (opts.json) {
          console.log(JSON.stringify({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          }, null, 2));
        } else {
          console.error(pc.red("Download failed: " + (err instanceof Error ? err.message : String(err))));
        }
        process.exitCode = 1;
      }
    });
}
