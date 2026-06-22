import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function readJsonAtRef(ref, relativePath) {
  const result = spawnSync("git", ["show", `${ref}:${relativePath}`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    throw new Error(output || `git show ${ref}:${relativePath} failed`);
  }
  return JSON.parse(result.stdout);
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
  const apiContractPkg = readJson("packages/api-contract/package.json");

  if (cliPkg.name !== "@growthub/cli") {
    throw new Error(`cli/package.json must publish @growthub/cli, got ${cliPkg.name}`);
  }
  if (createPkg.name !== "@growthub/create-growthub-local") {
    throw new Error(
      `packages/create-growthub-local/package.json must publish @growthub/create-growthub-local, got ${createPkg.name}`,
    );
  }
  if (createPkg.dependencies?.["@growthub/cli"] !== cliPkg.version) {
    throw new Error(
      `Version pin mismatch: @growthub/create-growthub-local pins @growthub/cli@${createPkg.dependencies?.["@growthub/cli"]} but cli.version is ${cliPkg.version}`,
    );
  }
  if (cliPkg.dependencies?.["@growthub/api-contract"] !== apiContractPkg.version) {
    throw new Error(
      `Version pin mismatch: @growthub/cli pins @growthub/api-contract@${cliPkg.dependencies?.["@growthub/api-contract"]} but api-contract.version is ${apiContractPkg.version}`,
    );
  }

  if (options.requireBumpIfSourceChanged && options.base) {
    const cliPayloadChanges = gitDiffNameOnly(options.base, options.head, [
      "server/src",
      "cli/src",
      "cli/assets",
    ]);
    if (cliPayloadChanges.length > 0) {
      const baseCliPkg = readJsonAtRef(options.base, "cli/package.json");
      const baseCreatePkg = readJsonAtRef(
        options.base,
        "packages/create-growthub-local/package.json",
      );
      if (baseCliPkg.version === cliPkg.version || baseCreatePkg.version === createPkg.version) {
        throw new Error(
          "Published CLI payload changed under server/src, cli/src, or cli/assets but @growthub/cli and @growthub/create-growthub-local versions were not both bumped.",
        );
      }
    }
    const apiContractSourceChanges = gitDiffNameOnly(options.base, options.head, [
      "packages/api-contract/src",
    ]);
    if (apiContractSourceChanges.length > 0) {
      const baseApiContractPkg = readJsonAtRef(options.base, "packages/api-contract/package.json");
      if (baseApiContractPkg.version === apiContractPkg.version) {
        throw new Error(
          "Published API contract source changed under packages/api-contract/src but package version was not bumped.",
        );
      }
    }
  }

  console.log(
    [
      "version-sync passed",
      `@growthub/cli@${cliPkg.version}`,
      `@growthub/create-growthub-local@${createPkg.version}`,
      `@growthub/api-contract@${apiContractPkg.version}`,
    ].join("\n"),
  );
}

main();
