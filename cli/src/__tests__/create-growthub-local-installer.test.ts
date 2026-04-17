/**
 * create-growthub-local installer — end-to-end argv routing tests.
 *
 * The installer is a thin wrapper that forwards to `@growthub/cli`. We exercise
 * the routing by pointing `GROWTHUB_LOCAL_CLI_ENTRYPOINT` at a stub script that
 * records its own argv + env into a JSON file and exits 0. That lets us assert
 * exactly which growthub command and options the installer invoked for every
 * supported flag combination.
 *
 * No Commander, no prompts, no @growthub/cli runtime required here — this
 * validates the three supported paths:
 *   --profile workspace   → growthub starter init ...
 *   --profile gtm|dx      → growthub onboard --yes ...
 *   (no profile)          → growthub discover ...
 *
 * Also asserts installer-mode env is always set and the Paperclip surface
 * profile is NOT leaked into the workspace path.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const installerBin = path.resolve(repoRoot, "packages/create-growthub-local/bin/create-growthub-local.mjs");

interface Capture {
  argv: string[];
  env: Record<string, string>;
}

let tempDir: string;
let stubCliPath: string;
let capturePath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "growthub-installer-test-"));
  capturePath = path.join(tempDir, "capture.json");
  stubCliPath = path.join(tempDir, "stub-cli.mjs");

  // Stub @growthub/cli entrypoint: record argv + env, exit 0.
  fs.writeFileSync(
    stubCliPath,
    [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "const capturePath = process.env.GROWTHUB_INSTALLER_TEST_CAPTURE;",
      "if (!capturePath) { console.error('test harness missing capture path'); process.exit(2); }",
      "fs.writeFileSync(capturePath, JSON.stringify({ argv: process.argv.slice(2), env: { GROWTHUB_INSTALLER_MODE: process.env.GROWTHUB_INSTALLER_MODE, PAPERCLIP_SURFACE_PROFILE: process.env.PAPERCLIP_SURFACE_PROFILE } }, null, 2));",
      "process.exit(0);",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function runInstaller(args: string[]): { status: number; stdout: string; stderr: string; capture: Capture | null } {
  if (fs.existsSync(capturePath)) fs.rmSync(capturePath);
  const res = spawnSync(process.execPath, [installerBin, ...args], {
    cwd: tempDir,
    env: {
      ...process.env,
      GROWTHUB_LOCAL_CLI_ENTRYPOINT: stubCliPath,
      GROWTHUB_INSTALLER_TEST_CAPTURE: capturePath,
    },
    encoding: "utf8",
  });
  let capture: Capture | null = null;
  if (fs.existsSync(capturePath)) {
    try { capture = JSON.parse(fs.readFileSync(capturePath, "utf8")); } catch { capture = null; }
  }
  return { status: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "", capture };
}

describe("create-growthub-local installer", () => {
  it("falls through to `growthub discover` with no profile", () => {
    const { status, capture } = runInstaller([]);
    expect(status).toBe(0);
    expect(capture).not.toBeNull();
    expect(capture!.argv[0]).toBe("discover");
    expect(capture!.env.GROWTHUB_INSTALLER_MODE).toBe("true");
    expect(capture!.env.PAPERCLIP_SURFACE_PROFILE).toBeFalsy();
  });

  it("invokes `growthub onboard --yes` for --profile dx", () => {
    const { status, capture } = runInstaller(["--profile", "dx"]);
    expect(status).toBe(0);
    expect(capture).not.toBeNull();
    expect(capture!.argv.slice(0, 2)).toEqual(["onboard", "--yes"]);
    expect(capture!.env.PAPERCLIP_SURFACE_PROFILE).toBe("dx");
    expect(capture!.env.GROWTHUB_INSTALLER_MODE).toBe("true");
  });

  it("invokes `growthub onboard --yes --run` for --profile gtm --run", () => {
    const { status, capture } = runInstaller(["--profile", "gtm", "--run"]);
    expect(status).toBe(0);
    expect(capture).not.toBeNull();
    expect(capture!.argv.slice(0, 3)).toEqual(["onboard", "--yes", "--run"]);
    expect(capture!.env.PAPERCLIP_SURFACE_PROFILE).toBe("gtm");
  });

  it("forwards to `growthub starter init --out <path>` for --profile workspace", () => {
    const outRel = "./ws-test-1";
    const { status, capture } = runInstaller(["--profile", "workspace", "--out", outRel]);
    expect(status).toBe(0);
    expect(capture).not.toBeNull();
    expect(capture!.argv[0]).toBe("starter");
    expect(capture!.argv[1]).toBe("init");
    const outIdx = capture!.argv.indexOf("--out");
    expect(outIdx).toBeGreaterThan(1);
    expect(path.isAbsolute(capture!.argv[outIdx + 1])).toBe(true);
    expect(capture!.env.GROWTHUB_INSTALLER_MODE).toBe("true");
    // workspace profile must NOT leak PAPERCLIP_SURFACE_PROFILE
    expect(capture!.env.PAPERCLIP_SURFACE_PROFILE).toBeFalsy();
  });

  it("passes --name, --upstream, --remote-sync-mode, --json through to `growthub starter init`", () => {
    const { status, capture } = runInstaller([
      "--profile", "workspace",
      "--out", "./ws-test-2",
      "--name", "My Workspace",
      "--upstream", "octocat/my-workspace",
      "--remote-sync-mode", "pr",
      "--json",
    ]);
    expect(status).toBe(0);
    expect(capture).not.toBeNull();
    const a = capture!.argv;
    expect(a[0]).toBe("starter");
    expect(a[1]).toBe("init");
    expect(a).toContain("--name");
    expect(a[a.indexOf("--name") + 1]).toBe("My Workspace");
    expect(a).toContain("--upstream");
    expect(a[a.indexOf("--upstream") + 1]).toBe("octocat/my-workspace");
    expect(a).toContain("--remote-sync-mode");
    expect(a[a.indexOf("--remote-sync-mode") + 1]).toBe("pr");
    expect(a).toContain("--json");
  });

  it("defaults workspace --out to ./my-workspace when no --out given", () => {
    const { status, capture } = runInstaller(["--profile", "workspace"]);
    expect(status).toBe(0);
    expect(capture).not.toBeNull();
    const outIdx = capture!.argv.indexOf("--out");
    expect(outIdx).toBeGreaterThan(-1);
    expect(capture!.argv[outIdx + 1]).toContain("my-workspace");
  });

  it("rejects unsupported profile values", () => {
    const { status, stderr } = runInstaller(["--profile", "bogus"]);
    expect(status).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/profile/);
  });

  it("rejects unsupported --remote-sync-mode values", () => {
    const { status, stderr } = runInstaller([
      "--profile", "workspace",
      "--out", "./x",
      "--remote-sync-mode", "bogus",
    ]);
    expect(status).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/remote-sync-mode/);
  });

  it("prints usage for -h", () => {
    const { status, stdout } = runInstaller(["-h"]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/--profile/);
    expect(stdout).toMatch(/workspace/);
  });
});
