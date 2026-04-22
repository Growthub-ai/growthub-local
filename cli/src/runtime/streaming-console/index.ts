/**
 * Streaming Console — Runtime
 *
 * Single rendering+logging surface shared by:
 *   - `growthub chat` (interactive + one-shot)
 *   - `growthub pipeline execute` (hosted workflow stream)
 *   - harness chat sessions (Open Agents / Qwen / T3)
 *
 * Renderers follow the existing CLI visual vocabulary (pc.* colors,
 * dim separators, emoji-prefixed node statuses). Persistence uses the
 * same JSONL pattern as `fork-trace`.
 */

import { randomUUID } from "node:crypto";
import pc from "picocolors";
import type {
  ExecuteWorkflowStreamEvent,
  HostedExecutionArtifactRef,
} from "@growthub/api-contract/execute";
import {
  appendSessionRecord,
  readSessionTranscript,
  resolveSessionTranscriptPath,
} from "./session-log.js";
import type {
  StreamingConsoleAssistantMessage,
  StreamingConsoleHandle,
  StreamingConsoleOptions,
  StreamingConsoleRecord,
} from "./types.js";

export type {
  StreamingConsoleHandle,
  StreamingConsoleOptions,
  StreamingConsoleRecord,
  StreamingConsoleAssistantChunk,
  StreamingConsoleAssistantMessage,
  StreamingConsoleUserMessage,
  StreamingConsoleSystemMessage,
  StreamingConsoleWorkflowEvent,
  StreamingConsoleArtifactEvent,
  StreamingConsoleErrorEvent,
} from "./types.js";
export {
  resolveSessionsDir,
  resolveSessionTranscriptPath,
  readSessionTranscript,
} from "./session-log.js";

function stamp(): string {
  return new Date().toISOString();
}

function renderNodeStatus(event: ExecuteWorkflowStreamEvent, opts: { silent: boolean }): void {
  if (opts.silent) return;
  switch (event.type) {
    case "node_start":
      process.stdout.write(`  ${pc.cyan("▶")} ${pc.dim(event.nodeId)} ${pc.bold(event.slug ?? "")}\n`);
      return;
    case "node_complete":
      process.stdout.write(`  ${pc.green("✓")} ${pc.dim(event.nodeId)} ${pc.bold(event.slug ?? "")}\n`);
      return;
    case "node_error":
      process.stdout.write(`  ${pc.red("✗")} ${pc.dim(event.nodeId)} ${pc.bold(event.slug ?? "")}  ${pc.red(event.error)}\n`);
      return;
    case "start":
      process.stdout.write(pc.dim(`  workflow start ${event.executionId ?? ""}\n`));
      return;
    case "complete":
      process.stdout.write(pc.green(`  workflow complete ${event.executionId ?? ""}\n`));
      return;
    case "error":
      process.stdout.write(pc.red(`  workflow error: ${event.error}\n`));
      return;
  }
}

function renderArtifact(artifact: HostedExecutionArtifactRef, silent: boolean): void {
  if (silent) return;
  const href = artifact.url ?? artifact.storagePath ?? "";
  process.stdout.write(
    `  ${pc.magenta("◆")} ${pc.bold(artifact.artifactType)} ${pc.dim(artifact.artifactId)}  ${pc.dim(href)}\n`,
  );
}

export function createStreamingConsole(options: StreamingConsoleOptions = {}): StreamingConsoleHandle {
  const sessionId = options.sessionId ?? randomUUID();
  const silent = Boolean(options.silent);
  const persist = options.persist !== false;
  const transcriptPath = persist ? resolveSessionTranscriptPath(sessionId, options.forkPath) : null;

  let buffered = "";

  function record(entry: StreamingConsoleRecord): void {
    if (transcriptPath) {
      appendSessionRecord(transcriptPath, entry);
    }
  }

  function flushAssistantChunkIfBuffered(final: boolean): void {
    if (buffered.length === 0) return;
    record({ kind: "assistant_chunk", at: stamp(), text: buffered, final });
    buffered = "";
  }

  return {
    sessionId,
    transcriptPath,

    writeUser(text: string) {
      record({ kind: "user_message", at: stamp(), text });
      if (!silent) {
        process.stdout.write(`\n${pc.cyan("you")} ${pc.dim("›")} ${text}\n\n`);
      }
    },

    writeSystem(text: string) {
      record({ kind: "system_message", at: stamp(), text });
      if (!silent) {
        process.stdout.write(pc.dim(`  · ${text}\n`));
      }
    },

    writeAssistantChunk(text: string, chunkOpts) {
      const final = Boolean(chunkOpts?.final);
      if (!silent) {
        process.stdout.write(text);
        if (final) process.stdout.write("\n");
      }
      buffered += text;
      if (final) {
        flushAssistantChunkIfBuffered(true);
      }
    },

    writeAssistantMessage(message: Omit<StreamingConsoleAssistantMessage, "kind" | "at">) {
      flushAssistantChunkIfBuffered(true);
      const entry: StreamingConsoleAssistantMessage = {
        kind: "assistant_message",
        at: stamp(),
        ...message,
      };
      record(entry);
      if (!silent) {
        process.stdout.write(`\n${pc.green("assistant")} ${pc.dim("›")} ${message.text}\n`);
        if (message.modelId) {
          const latency = typeof message.latencyMs === "number" ? ` · ${message.latencyMs}ms` : "";
          process.stdout.write(pc.dim(`  (${message.modelId}${latency})\n`));
        }
      }
    },

    writeWorkflowEvent(event: ExecuteWorkflowStreamEvent) {
      record({ kind: "workflow_event", at: stamp(), event });
      renderNodeStatus(event, { silent });
    },

    writeArtifact(artifact: HostedExecutionArtifactRef) {
      record({ kind: "artifact", at: stamp(), artifact });
      renderArtifact(artifact, silent);
    },

    writeError(message: string, cause?: string) {
      record({ kind: "error", at: stamp(), message, cause });
      if (!silent) {
        process.stdout.write(pc.red(`  ✗ ${message}\n`));
        if (cause) process.stdout.write(pc.dim(`    ${cause}\n`));
      }
    },

    readRecords() {
      if (!transcriptPath) return [];
      return readSessionTranscript(transcriptPath);
    },

    close() {
      flushAssistantChunkIfBuffered(true);
    },
  };
}
