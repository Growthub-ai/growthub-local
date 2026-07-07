/**
 * Training local readiness probe — the IO half of the configuration-step
 * readiness contract. Server-only (node:fs / node:os / node:child_process):
 * imported by /api/workspace/training-readiness, NEVER by client components —
 * the pure deriver the modal renders lives in training-local-readiness.js.
 *
 * Every probe is bounded (timeouts, capped volume walks) and never throws —
 * absence is reported as honest evidence ({ ok:false } / empty lists), not an
 * error. Nothing here creates folders, pulls models, or mutates governance:
 * it only OBSERVES what the local substrate already carries, so the dropdowns
 * can offer real options only.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { TRAINING_READINESS_KIND, EXTERNAL_FOLDER_CANDIDATES, WORKSPACE_FALLBACK_FOLDER } from "./training-local-readiness.js";
import { isContainedPath } from "./training-runtime-profiles.js";
import { PIPELINE_SCRIPTS } from "./training-pipeline-scripts.js";

/** Known Ollama binary locations beyond PATH (macOS app + brew installs). */
const OLLAMA_BIN_CANDIDATES = [
  "/usr/local/bin/ollama",
  "/opt/homebrew/bin/ollama",
  "/Applications/Ollama.app/Contents/Resources/ollama",
  "/Applications/Ollama.app/Contents/MacOS/ollama",
];

const OLLAMA_DEFAULT_URL = "http://127.0.0.1:11434";
const PROBE_TIMEOUT_MS = 1200;
const MAX_VOLUMES = 6;

/** The real IO surface. Tests inject a fake with the same shape. */
export function buildDefaultReadinessIo() {
  return {
    platform: () => process.platform,
    cwd: () => process.cwd(),
    homeDir: () => os.homedir(),
    env: (key) => process.env[String(key)] || "",
    totalRamGB: () => Math.floor(os.totalmem() / 1e9),
    listDir: (p) => fs.readdirSync(p),
    realpath: (p) => fs.realpathSync(p),
    exists: (p) => fs.existsSync(p),
    isDirectory: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
    writable: (p) => { try { fs.accessSync(p, fs.constants.W_OK); return true; } catch { return false; } },
    statfsFreeGB: (p) => { try { const s = fs.statfsSync(p); return Math.floor((s.bavail * s.bsize) / 1e9); } catch { return 0; } },
    which: (bin) => {
      try { return execFileSync("which", [bin], { stdio: ["ignore", "pipe", "ignore"], timeout: PROBE_TIMEOUT_MS }).toString().trim(); }
      catch { return ""; }
    },
    gpuProbe: () => {
      try {
        const out = execFileSync("nvidia-smi", ["--query-gpu=name,memory.free", "--format=csv,noheader,nounits"], { stdio: ["ignore", "pipe", "ignore"], timeout: PROBE_TIMEOUT_MS }).toString().trim();
        if (!out) return { present: false, name: "", vramFreeGB: 0 };
        const [name, freeMiB] = out.split("\n")[0].split(",").map((s) => s.trim());
        return { present: true, name, vramFreeGB: Math.floor(Number(freeMiB) / 1024) };
      } catch { return { present: false, name: "", vramFreeGB: 0 }; }
    },
    fetchJson: async (url, timeoutMs = PROBE_TIMEOUT_MS) => {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`probe ${res.status}`);
      return res.json();
    },
    spawnDetached: async (bin, args, env) => {
      const { spawn } = await import("node:child_process");
      const child = spawn(bin, args, { detached: true, stdio: "ignore", env: { ...process.env, ...env } });
      child.unref();
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

/** Ollama base URLs worth probing: the local default plus any :11434-style
 *  model row the workspace already registered (deduped, capped). */
function ollamaBaseUrls(workspaceConfig) {
  const urls = [OLLAMA_DEFAULT_URL];
  const rows = (workspaceConfig?.dataModel?.objects || [])
    .filter((o) => o?.objectType === "api-registry")
    .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
  for (const r of rows) {
    const u = String(r?.baseUrl || "");
    if (!u.includes(":11434")) continue;
    const root = u.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
    if (root && !urls.includes(root)) urls.push(root);
  }
  return urls.slice(0, 3);
}

/** Find the Ollama binary even when it is not on the server process PATH. */
function findOllamaBin(io) {
  const onPath = io.which("ollama");
  if (onPath) return onPath;
  for (const p of OLLAMA_BIN_CANDIDATES) {
    try { if (io.exists(p)) return p; } catch { /* keep looking */ }
  }
  return "";
}

/** Ollama models-directory candidates: explicit env, the home default, and
 *  any `<volume>/ollama[/models]` store on a detected external drive (the
 *  offload/preserve pattern) — a user's models COUNT whether or not the
 *  server process happens to be running. */
function findOllamaModelsDir(io, volumeRoots) {
  const candidates = [];
  const envDir = typeof io.env === "function" ? io.env("OLLAMA_MODELS") : "";
  if (envDir) candidates.push(envDir);
  const home = typeof io.homeDir === "function" ? io.homeDir() : "";
  if (home) candidates.push(path.join(home, ".ollama", "models"));
  for (const root of volumeRoots) {
    candidates.push(`${root}/ollama/models`, `${root}/ollama`);
  }
  for (const dir of candidates) {
    try { if (io.isDirectory(path.join(dir, "manifests", "registry.ollama.ai", "library"))) return dir; } catch { /* next */ }
  }
  return "";
}

/** Read the REAL installed model tags straight from an Ollama models store
 *  (manifests/registry.ollama.ai/library/<name>/<tag>). Never throws. */
function scanOllamaDiskModels(io, modelsDir) {
  const models = [];
  if (!modelsDir) return models;
  const library = path.join(modelsDir, "manifests", "registry.ollama.ai", "library");
  let names = [];
  try { names = io.listDir(library); } catch { return models; }
  for (const name of names) {
    if (String(name).startsWith(".")) continue;
    let tags = [];
    try { tags = io.listDir(path.join(library, name)); } catch { continue; }
    for (const tag of tags) {
      if (String(tag).startsWith(".")) continue;
      const full = `${name}:${tag}`;
      if (!models.some((m) => m.tag === full)) models.push({ tag: full, sizeBytes: 0, source: "disk" });
    }
  }
  return models;
}

/** Read the live server's tags from the first answering base URL. */
async function readServerModels(io, workspaceConfig) {
  for (const baseUrl of ollamaBaseUrls(workspaceConfig)) {
    let data = null;
    try { data = await io.fetchJson(`${baseUrl}/api/tags`, PROBE_TIMEOUT_MS); } catch { data = null; }
    if (!data || !Array.isArray(data.models)) continue;
    const models = [];
    for (const m of data.models) {
      const tag = String(m?.name || "").trim();
      if (tag && !models.some((x) => x.tag === tag)) models.push({ tag, sizeBytes: Number(m?.size) || 0, source: "ollama" });
    }
    return { baseUrl, models };
  }
  return null;
}

/** Probe Ollama for the REAL locally installed model tags. The configuration
 *  step ENSURES the server: when it is installed but stopped, it is started
 *  here automatically (detached, pointed at the user's real model store) —
 *  the user is never asked to start or install anything. Models found on
 *  disk count even while the server is still coming up. */
async function probeOllamaModels(io, workspaceConfig, volumeRoots) {
  const binPath = findOllamaBin(io);
  const modelsDir = findOllamaModelsDir(io, volumeRoots);
  let live = await readServerModels(io, workspaceConfig);
  let autoStarted = false;
  if (!live && binPath && typeof io.spawnDetached === "function") {
    try {
      const env = modelsDir ? { OLLAMA_MODELS: modelsDir } : {};
      await io.spawnDetached(binPath, ["serve"], env);
      for (let i = 0; i < 8 && !live; i += 1) {
        await io.sleep(1000);
        live = await readServerModels(io, workspaceConfig);
      }
      autoStarted = Boolean(live);
    } catch { /* recorded honestly below — never throws */ }
  }
  if (live) return { reachable: true, baseUrl: live.baseUrl, models: live.models, binPath, modelsDir, appInstalled: Boolean(binPath), autoStarted };
  return { reachable: false, baseUrl: OLLAMA_DEFAULT_URL, models: scanOllamaDiskModels(io, modelsDir), binPath, modelsDir, appInstalled: Boolean(binPath), autoStarted: false };
}

/** A folder is writable when it exists and accepts writes, or when its nearest
 *  existing ancestor does (the runner mkdir -p's the artifact root). */
export function checkFolderWritable(io, folder) {
  let probeAt = String(folder || "");
  for (let depth = 0; depth < 12 && probeAt && !io.exists(probeAt); depth += 1) {
    const parent = path.dirname(probeAt);
    if (parent === probeAt) return { writable: false, checkedAt: probeAt };
    probeAt = parent;
  }
  if (!probeAt || !io.exists(probeAt)) return { writable: false, checkedAt: probeAt };
  return { writable: io.writable(probeAt), checkedAt: probeAt };
}

/** Discover storage locations: external volume roots + their already-existing
 *  candidate subfolders, then the workspace fallback. Never creates anything. */
function discoverStorageLocations(io) {
  const locations = [];
  if (io.platform() === "darwin") {
    let volumes = [];
    try { volumes = io.listDir("/Volumes"); } catch { volumes = []; }
    for (const name of volumes.slice(0, MAX_VOLUMES)) {
      if (String(name).startsWith(".")) continue;
      const root = `/Volumes/${name}`;
      // The boot volume appears here as a symlink to "/" — an external drive
      // list should not offer the system disk as an "external" location.
      try { if (io.realpath(root) === "/") continue; } catch { continue; }
      if (!io.isDirectory(root)) continue;
      const candidates = [root, ...EXTERNAL_FOLDER_CANDIDATES.map((c) => `${root}/${c}`).filter((p) => io.isDirectory(p))];
      for (const p of candidates) {
        locations.push({ path: p, kind: "external", writable: io.writable(p), freeGB: io.statfsFreeGB(p), exists: true });
      }
    }
  }
  // Local workspace cache fallback — always offered, workspace-relative so it
  // stays inside the argv containment rule. Created by the runner on first use.
  const cwd = io.cwd();
  const localDir = path.join(cwd, "artifacts");
  locations.push({
    path: WORKSPACE_FALLBACK_FOLDER,
    kind: "workspace",
    writable: io.exists(localDir) ? io.writable(localDir) : io.writable(cwd),
    freeGB: io.statfsFreeGB(cwd),
    exists: io.exists(localDir),
  });
  return locations;
}

/** Find a llama.cpp asset (binary or script) in the workspace or on any
 *  detected external llama.cpp folder. Returns the found path or "". */
function findPipelineAsset(io, names, externalDirs) {
  const roots = [io.cwd(), ...externalDirs];
  for (const root of roots) {
    for (const name of names) {
      const p = path.join(root, name);
      if (io.exists(p)) return p;
    }
  }
  return "";
}

/** Probe availability of every tool the one-click pipeline invokes. */
function probeTooling(io, storageLocations, ollama) {
  const externalLlama = storageLocations
    .filter((l) => l.kind === "external" && /\/llama\.cpp$/.test(String(l.path)))
    .map((l) => String(l.path));
  const externalBuildDirs = externalLlama.flatMap((d) => [d, `${d}/build/bin`]);

  const python = io.which("python3") || io.which("python");
  // train / merge / convert scripts are the WORKSPACE'S OWN files — provisioned
  // automatically by the pre-init probe when absent, never a user install.
  const provisioned = Object.keys(PIPELINE_SCRIPTS);
  const quantizeBin = findPipelineAsset(io, ["llama-quantize"], externalBuildDirs);
  const imatrixBin = findPipelineAsset(io, ["llama-imatrix"], externalBuildDirs);

  return [
    { id: "dataset-builder", label: "Training data builder", ok: true, detail: "Built into this workspace" },
    { id: "python-runtime", label: "Python runtime", ok: Boolean(python), detail: python || "python3 not found" },
    { id: "pipeline-scripts", label: "Pipeline scripts", ok: true, detail: `Included with this workspace (${provisioned.join(", ")})` },
    { id: "quantize-tools", label: "Quantize tools", ok: Boolean(quantizeBin && imatrixBin), detail: quantizeBin ? `${quantizeBin}${imatrixBin ? "" : " (importance-matrix tool missing)"}` : "llama.cpp quantize tools not found yet — training reports this step honestly if still missing" },
    { id: "ollama-cli", label: "Ollama app", ok: Boolean(ollama.binPath), detail: ollama.binPath || "Ollama app not found yet" },
    { id: "model-server", label: "Local model server", ok: Boolean(ollama.reachable), detail: ollama.reachable ? ollama.baseUrl : (ollama.binPath ? "Not running — started automatically at finalize" : "Not running") },
    { id: "workflow-test-lane", label: "Workflow test lane", ok: true, detail: "Built into this workspace" },
  ];
}

/**
 * Collect the full local readiness picture. Bounded, never throws.
 *
 * @param {object} opts
 * @param {object} [opts.io]              IO surface (tests inject a fake)
 * @param {object} [opts.workspaceConfig] governed config (extra Ollama URLs)
 * @param {string} [opts.folder]          optional specific folder to verify —
 *                                        returned as `folderCheck`
 */
export async function collectTrainingLocalReadiness({ io = buildDefaultReadinessIo(), workspaceConfig = null, folder = "" } = {}) {
  const storageLocations = discoverStorageLocations(io);
  const volumeRoots = [...new Set(storageLocations
    .filter((l) => l.kind === "external")
    .map((l) => { const m = /^(\/Volumes\/[^/]+)/.exec(String(l.path)); return m ? m[1] : ""; })
    .filter(Boolean))];
  const ollama = await probeOllamaModels(io, workspaceConfig, volumeRoots);
  const tooling = probeTooling(io, storageLocations, ollama);

  const ramGB = io.totalRamGB();
  const diskFreeGB = io.statfsFreeGB(io.cwd());
  const gpu = io.gpuProbe();
  const preflight = { available: ramGB > 0 && diskFreeGB > 0, ramGB, diskFreeGB, gpu, cpuOnly: !gpu.present };

  // Dedicated training virtualenv — Homebrew/system pythons are externally
  // managed (PEP 668) and refuse package installs; the workspace owns its own
  // venv instead (created by the pre-init probe, used by the training runner).
  // Computed HERE because the sandbox lane overrides HOME to a throwaway dir.
  const home = typeof io.homeDir === "function" ? io.homeDir() : "";
  const venvDir = home ? path.join(home, ".growthub", "training-venv") : "";
  const out = {
    kind: TRAINING_READINESS_KIND,
    runtime: {
      ollama: { reachable: ollama.reachable, baseUrl: ollama.baseUrl, binPath: ollama.binPath, modelsDir: ollama.modelsDir, appInstalled: ollama.appInstalled, autoStarted: Boolean(ollama.autoStarted) },
      python: { venvDir, venvReady: venvDir ? io.exists(path.join(venvDir, "bin", "python")) : false },
    },
    baseModels: ollama.models,
    storageLocations,
    tooling,
    preflight,
  };

  const wanted = String(folder || "").trim();
  if (wanted) {
    // Only paths the argv containment rule would accept are worth probing —
    // anything else is refused here for the same reason the runner refuses it.
    if (!isContainedPath(wanted)) {
      out.folderCheck = { path: wanted, allowed: false, writable: false, freeGB: 0, detail: "Pick a folder inside this workspace or on an external drive (/Volumes/…)." };
    } else {
      const probeBase = wanted.startsWith("/") ? wanted : path.join(io.cwd(), wanted);
      const { writable } = checkFolderWritable(io, probeBase);
      out.folderCheck = { path: wanted, allowed: true, writable, freeGB: writable ? io.statfsFreeGB(probeBase.startsWith("/") ? findExistingAncestor(io, probeBase) : io.cwd()) : 0, detail: writable ? "" : "That folder can't be written to — pick another." };
    }
  }
  return out;
}

/** Nearest existing ancestor (for free-space measurement of a folder that the
 *  runner would create on first use). */
function findExistingAncestor(io, p) {
  let probeAt = String(p || "");
  for (let depth = 0; depth < 12 && probeAt && !io.exists(probeAt); depth += 1) {
    const parent = path.dirname(probeAt);
    if (parent === probeAt) break;
    probeAt = parent;
  }
  return probeAt || "/";
}
