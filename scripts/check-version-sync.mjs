import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function parseArgs(argv) {
  const options = {
    requireBumpIfSourceChanged: false,
    base: null,
    head: "HEAD",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--require-bump-if-source-changed") {
      options.requireBumpIfSourceChanged = true;
      continue;
    }
    if (arg === "--base") {
      options.base = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--head") {
      options.head = argv[index + 1] ?? "HEAD";
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function gitDiffNameOnly(base, head, paths = []) {
  const args = ["diff", "--name-only", `${base}..${head}`, "--", ...paths];
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    throw new Error(output || `git ${args.join(" ")} failed`);
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const cliPkg = readJson("cli/package.json");
  const createPkg = readJson("packages/create-growthub-local/package.json");

  if (cliPkg.name !== "@growthub/cli") {
    throw new Error(`cli/package.json must publish @growthub/cli, got ${cliPkg.name}`);
  }
  if (createPkg.name !== "create-growthub-local") {
    throw new Error(
      `packages/create-growthub-local/package.json must publish create-growthub-local, got ${createPkg.name}`,
    );
  }
  if (createPkg.dependencies?.["@growthub/cli"] !== cliPkg.version) {
    throw new Error(
      `Version pin mismatch: create-growthub-local pins @growthub/cli@${createPkg.dependencies?.["@growthub/cli"]} but cli.version is ${cliPkg.version}`,
    );
  }

  if (options.requireBumpIfSourceChanged && options.base) {
    const sourceChanges = gitDiffNameOnly(options.base, options.head, ["ui/src", "server/src", "cli/src"]);
    if (sourceChanges.length > 0) {
      const versionChanges = gitDiffNameOnly(options.base, options.head, [
        "cli/package.json",
        "packages/create-growthub-local/package.json",
      ]);
      if (versionChanges.length === 0) {
        throw new Error(
          "Source files changed under ui/src, server/src, or cli/src but package versions were not bumped.",
        );
      }
    }
  }

  console.log(
    [
      "version-sync passed",
      `@growthub/cli@${cliPkg.version}`,
      `create-growthub-local@${createPkg.version}`,
    ].join("\n"),
  );
}

main();
