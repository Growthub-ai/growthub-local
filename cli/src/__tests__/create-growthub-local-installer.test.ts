/**
 * Installer-aware starter — create-growthub-local routing tests.
 *
 * These tests exercise the bin/create-growthub-local.mjs entrypoint
 * with a stub CLI binary (via GROWTHUB_LOCAL_CLI_ENTRYPOINT) to prove:
 *
 *   1. `--profile workspace --out ./...` routes to `growthub starter init`
 *      with --out forwarded as an absolute path (zero second step).
 *   2. Optional workspace flags (--name / --upstream / --remote-sync-mode /
 *      --destination-org / --fork-name / --kit / --json) are forwarded.
 *   3. `--profile gtm|dx` still routes to `growthub onboard --yes` with
 *      the existing --data-dir / PAPERCLIP_SURFACE_PROFILE wiring
 *      (backwards compatibility).
 *   4. No profile still routes to `growthub discover` (discovery mode).
 *   5. Rejects invalid `--profile` / `--remote-sync-mode` values.
 *   6. Rejects workspace-only flags (`--out`, `--upstream`, etc.) when
 *      paired with a non-workspace profile (so users get a clear error
 *      instead of silently losing arguments).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "../../..");
const INSTALLER_BIN = path.resolve(
  REPO_ROOT,
  "packages/create-growthub-local/bin/create-growthub-local.mjs",
);

type StubRun = {
  argv: string[];
  env: Record<string, string | undefined>;
  cwd: string;
};

function makeStub(tmpDir: string): { stubPath: string; logPath: string } {
  const logPath = path.join(tmpDir, "stub.log");
  const stubPath = path.join(tmpDir, "stub-cli.mjs");
  const stubSrc = `
    import fs from "node:fs";
    fs.writeFileSync(
      ${JSON.stringify(logPath)},
      JSON.stringify({
        argv: process.argv.slice(2),
        env: {
          GROWTHUB_INSTALLER_MODE: process.env.GROWTHUB_INSTALLER_MODE ?? null,
          PAPERCLIP_SURFACE_PROFILE: process.env.PAPERCLIP_SURFACE_PROFILE ?? null,
        },
        cwd: process.cwd(),
      }),
      "utf8"
    );
    process.exit(0);
  `;
  fs.writeFileSync(stubPath, stubSrc, "utf8");
  return { stubPath, logPath };
}

function runInstaller(
  tmpDir: string,
  args: string[],
): { status: number | null; stderr: string; stub: StubRun | null } {
  const { stubPath, logPath } = makeStub(tmpDir);

  const result = spawnSync(process.execPath, [INSTALLER_BIN, ...args], {
    cwd: tmpDir,
    encoding: "utf8",
    env: {
      ...process.env,
      GROWTHUB_LOCAL_CLI_ENTRYPOINT: stubPath,
    },
  });

  let stub: StubRun | null = null;
  if (fs.existsSync(logPath)) {
    stub = JSON.parse(fs.readFileSync(logPath, "utf8")) as StubRun;
  }
  return { status: result.status, stderr: result.stderr ?? "", stub };
}

let tmpRoot = "";

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "create-growthub-local-test-"));
});

afterEach(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("create-growthub-local — --profile workspace", () => {
  it("routes to `growthub starter init --out <abs>` with zero second step", () => {
    const { status, stub } = runInstaller(tmpRoot, [
      "--profile",
      "workspace",
      "--out",
      "./my-workspace",
    ]);

    expect(status).toBe(0);
    expect(stub).not.toBeNull();
    expect(stub!.argv.slice(0, 2)).toEqual(["starter", "init"]);

    const outIndex = stub!.argv.indexOf("--out");
    expect(outIndex).toBeGreaterThan(-1);
    const outValue = stub!.argv[outIndex + 1];
    expect(path.isAbsolute(outValue)).toBe(true);
    expect(outValue).toBe(path.resolve(fs.realpathSync(tmpRoot), "./my-workspace"));

    expect(stub!.env.GROWTHUB_INSTALLER_MODE).toBe("true");
    expect(stub!.env.PAPERCLIP_SURFACE_PROFILE).toBeNull();
  });

  it("forwards all optional workspace flags to `growthub starter init`", () => {
    const { status, stub } = runInstaller(tmpRoot, [
      "--profile",
      "workspace",
      "--out",
      "./ws",
      "--kit",
      "growthub-custom-workspace-starter-v1",
      "--name",
      "My Workspace",
      "--upstream",
      "Growthub-ai/growthub-custom-workspace-starter-v1",
      "--destination-org",
      "my-org",
      "--fork-name",
      "my-fork",
      "--remote-sync-mode",
      "pr",
      "--json",
    ]);

    expect(status).toBe(0);
    const argv = stub!.argv;
    expect(argv.slice(0, 2)).toEqual(["starter", "init"]);
    expect(argv).toContain("--kit");
    expect(argv[argv.indexOf("--kit") + 1]).toBe("growthub-custom-workspace-starter-v1");
    expect(argv).toContain("--name");
    expect(argv[argv.indexOf("--name") + 1]).toBe("My Workspace");
    expect(argv).toContain("--upstream");
    expect(argv[argv.indexOf("--upstream") + 1]).toBe("Growthub-ai/growthub-custom-workspace-starter-v1");
    expect(argv).toContain("--destination-org");
    expect(argv[argv.indexOf("--destination-org") + 1]).toBe("my-org");
    expect(argv).toContain("--fork-name");
    expect(argv[argv.indexOf("--fork-name") + 1]).toBe("my-fork");
    expect(argv).toContain("--remote-sync-mode");
    expect(argv[argv.indexOf("--remote-sync-mode") + 1]).toBe("pr");
    expect(argv).toContain("--json");
  });

  it("rejects invalid --remote-sync-mode values with a clear error", () => {
    const { status, stderr, stub } = runInstaller(tmpRoot, [
      "--profile",
      "workspace",
      "--out",
      "./ws",
      "--remote-sync-mode",
      "fireworks",
    ]);

    expect(status).toBe(1);
    expect(stderr).toContain("--remote-sync-mode");
    expect(stub).toBeNull();
  });
});

describe("create-growthub-local — backwards-compatible profiles", () => {
  it("routes --profile gtm to `growthub onboard --yes` with PAPERCLIP_SURFACE_PROFILE=gtm", () => {
    const { status, stub } = runInstaller(tmpRoot, [
      "--profile",
      "gtm",
      "--data-dir",
      "./growthub-gtm",
    ]);

    expect(status).toBe(0);
    expect(stub!.argv.slice(0, 2)).toEqual(["onboard", "--yes"]);
    expect(stub!.argv).toContain("--data-dir");
    expect(stub!.argv[stub!.argv.indexOf("--data-dir") + 1]).toBe(
      path.resolve(fs.realpathSync(tmpRoot), "./growthub-gtm"),
    );
    expect(stub!.env.PAPERCLIP_SURFACE_PROFILE).toBe("gtm");
    expect(stub!.env.GROWTHUB_INSTALLER_MODE).toBe("true");
  });

  it("routes --profile dx to `growthub onboard --yes` with PAPERCLIP_SURFACE_PROFILE=dx", () => {
    const { status, stub } = runInstaller(tmpRoot, ["--profile", "dx"]);

    expect(status).toBe(0);
    expect(stub!.argv.slice(0, 2)).toEqual(["onboard", "--yes"]);
    expect(stub!.env.PAPERCLIP_SURFACE_PROFILE).toBe("dx");
  });

  it("routes no profile to the governed workspace first-run discovery path", () => {
    const { status, stub } = runInstaller(tmpRoot, []);

    expect(status).toBe(0);
    expect(stub!.argv[0]).toBe("discover");
    expect(stub!.argv.slice(1, 3)).toEqual(["--start", "create-workspace"]);
    expect(stub!.env.PAPERCLIP_SURFACE_PROFILE).toBeNull();
  });

  it("forwards --run through the onboard lane", () => {
    const { status, stub } = runInstaller(tmpRoot, [
      "--profile",
      "gtm",
      "--run",
    ]);

    expect(status).toBe(0);
    expect(stub!.argv).toContain("--run");
  });
});

describe("create-growthub-local — validation", () => {
  it("rejects an unknown --profile", () => {
    const { status, stderr, stub } = runInstaller(tmpRoot, [
      "--profile",
      "operator",
    ]);

    expect(status).toBe(1);
    expect(stderr).toContain("--profile");
    expect(stub).toBeNull();
  });

  it("rejects workspace-only flags paired with a non-workspace profile", () => {
    const { status, stderr, stub } = runInstaller(tmpRoot, [
      "--profile",
      "gtm",
      "--out",
      "./ws",
    ]);

    expect(status).toBe(1);
    expect(stderr).toContain("--out");
    expect(stderr).toContain("--profile workspace");
    expect(stub).toBeNull();
  });
});
