import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFileIncludes(relativePath, patterns) {
  const fullPath = path.join(root, relativePath);
  const content = readFileSync(fullPath, "utf8");
  for (const pattern of patterns) {
    assert(content.includes(pattern), `${relativePath} is missing required text: ${pattern}`);
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== 0) {
    throw new Error(output.trim() || `${command} ${args.join(" ")} failed`);
  }
  return output;
}

const cliPkg = readJson("cli/package.json");
const createPkg = readJson("packages/create-growthub-local/package.json");

assert(cliPkg.name === "@growthub/cli", "cli/package.json must publish @growthub/cli");
assert(createPkg.name === "create-growthub-local", "packages/create-growthub-local/package.json must publish create-growthub-local");
assert(
  createPkg.dependencies?.["@growthub/cli"] === cliPkg.version,
  `create-growthub-local must depend on @growthub/cli@${cliPkg.version}`,
);

for (const pkg of [cliPkg, createPkg]) {
  assert(
    String(pkg.repository?.url || "").includes("antonioromero1220/growthub-local"),
    `${pkg.name} repository URL must point at antonioromero1220/growthub-local`,
  );
  assert(
    String(pkg.homepage || "").includes("antonioromero1220/growthub-local"),
    `${pkg.name} homepage must point at antonioromero1220/growthub-local`,
  );
  assert(
    String(pkg.bugs?.url || "").includes("antonioromero1220/growthub-local"),
    `${pkg.name} bugs URL must point at antonioromero1220/growthub-local`,
  );
}

assertFileIncludes("ui/src/components/GrowthubConnectionCard.tsx", [
  "Growthub Connection",
  "Open Configuration",
  "Pulse",
  "Disconnect",
]);

assertFileIncludes("ui/src/lib/growthub-connection.ts", [
  'url.pathname = "/integrations"',
  'url.searchParams.set("return_url", input.callbackUrl)',
]);

assertFileIncludes("server/src/app.ts", [
  'app.get("/auth/callback"',
  "growthubPortalBaseUrl",
  "growthubMachineLabel",
  "growthubWorkspaceLabel",
]);

assertFileIncludes("ui/src/pages/CompanySettings.tsx", [
  "Growthub pulse succeeded",
  "onPulseConnection",
  "onDisconnect",
]);

assertFileIncludes("ui/src/gtm/App.tsx", [
  "Growthub pulse succeeded",
  "onPulseConnection",
  "onDisconnect",
]);

assert(existsSync(path.join(root, "cli/dist")), "cli/dist must exist before release:check");
assert(existsSync(path.join(root, "server/dist")), "server/dist must exist before release:check");
assert(existsSync(path.join(root, "server/ui-dist")), "server/ui-dist must exist before release:check");
assert(
  existsSync(path.join(root, "cli/dist/runtime/server/dist/app.js")),
  "cli bundled runtime must exist before release:check",
);

const cliPack = run("npm", ["pack", "--dry-run"], path.join(root, "cli"));
const createPack = run("npm", ["pack", "--dry-run"], path.join(root, "packages/create-growthub-local"));

assert(
  cliPack.includes("dist/runtime/server/dist/app.js"),
  "CLI tarball is missing bundled runtime server app.js",
);
assert(
  cliPack.includes("dist/runtime/server/ui-dist"),
  "CLI tarball is missing bundled runtime UI payload",
);
assert(
  createPack.includes("bin/create-growthub-local.mjs"),
  "create-growthub-local tarball is missing installer entrypoint",
);

// Leak-prevention: block debug/source artifacts from escaping into published tarballs
const leakBlockers = ["src.zip", "r2.dev"];
for (const pack of [cliPack, createPack]) {
  for (const pattern of leakBlockers) {
    assert(!pack.includes(pattern), `Release blocked: ${pattern} artifact detected in tarball`);
  }
  // Block raw .ts source files (allow .d.ts declarations and .ts inside .js.map references)
  const rawTsLines = pack.split("\n").filter((l) =>
    l.includes(".ts") && !l.includes(".d.ts") && !l.includes(".js.map") && !l.includes(".js")
  );
  assert(rawTsLines.length === 0, "Release blocked: raw .ts source file detected in tarball");
}

process.stdout.write(
  [
    `release:check passed`,
    `@growthub/cli@${cliPkg.version}`,
    `create-growthub-local@${createPkg.version}`,
  ].join("\n") + "\n",
);
