import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  coerceGtmState,
  createDefaultGtmState,
  toGtmViewModel,
  type GtmState,
  type GtmViewModel,
} from "@paperclipai/shared";
import { resolvePaperclipHomeDir } from "../home-paths.js";

function resolveGtmStatePath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "gtm", "state.json");
}

function isPidRunning(pid: number | null | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function normalizeWorkflowRunState(state: GtmState): GtmState {
  const lastRun = state.workflow.lastRun;
  if (lastRun.status !== "running" || isPidRunning(lastRun.pid)) {
    return state;
  }
  return {
    ...state,
    workflow: {
      ...state.workflow,
      lastRun: {
        ...lastRun,
        finishedAt: lastRun.finishedAt ?? new Date().toISOString(),
        status: lastRun.error ? "failed" : "idle",
      },
    },
  };
}

export function readGtmState(): GtmState {
  const filePath = resolveGtmStatePath();
  const state = fs.existsSync(filePath)
    ? coerceGtmState(JSON.parse(fs.readFileSync(filePath, "utf-8")) as GtmState)
    : createDefaultGtmState();
  return normalizeWorkflowRunState(state);
}

export function writeGtmState(state: GtmState): void {
  const filePath = resolveGtmStatePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

export function readGtmViewModel(): GtmViewModel {
  return toGtmViewModel(readGtmState());
}

export function launchLocalGtmWorkflow(): GtmViewModel {
  const state = readGtmState();
  const runnerPath = state.workflow.runnerPath?.trim();
  if (!runnerPath) {
    throw new Error("No local SDR runner configured.");
  }
  if (!fs.existsSync(runnerPath)) {
    throw new Error(`Runner not found at ${runnerPath}`);
  }

  const args = runnerPath.endsWith(".mjs") || runnerPath.endsWith(".js")
    ? [runnerPath]
    : [];
  const command = args.length > 0 ? process.execPath : runnerPath;
  const child = spawn(command, args, {
    cwd: path.dirname(runnerPath),
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const nextState: GtmState = {
    ...state,
    workflow: {
      ...state.workflow,
      lastRun: {
        command: [command, ...args].join(" "),
        error: null,
        finishedAt: null,
        pid: child.pid ?? null,
        startedAt: new Date().toISOString(),
        status: "running",
      },
    },
  };
  writeGtmState(nextState);
  return toGtmViewModel(nextState);
}
