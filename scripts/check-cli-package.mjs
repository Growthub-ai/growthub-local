import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const cliPkg = readJson("cli/package.json");
const createPkg = readJson("packages/create-growthub-local/package.json");
const catalogModule = readText("cli/src/kits/catalog.ts");
const serviceModule = readText("cli/src/kits/service.ts");
const cliReadme = readText("cli/README.md");

assert(cliPkg.name === "@growthub/cli", "CLI package name must remain @growthub/cli");
assert(createPkg.dependencies?.["@growthub/cli"] === cliPkg.version, "Installer pin must match CLI version");

for (const requiredPath of [
  "cli/dist/index.js",
  "cli/dist/runtime/server/dist/app.js",
  "cli/dist/runtime/server/ui-dist",
  "cli/assets/worker-kits/creative-strategist-v1/kit.json",
  "cli/assets/worker-kits/creative-strategist-v1/bundles/creative-strategist-v1.json",
  "cli/assets/worker-kits/growthub-open-higgsfield-studio-v1/kit.json",
  "cli/assets/worker-kits/growthub-open-higgsfield-studio-v1/bundles/growthub-open-higgsfield-studio-v1.json",
]) {
  assert(existsSync(path.join(root, requiredPath)), `Missing shipped CLI artifact: ${requiredPath}`);
}

for (const requiredToken of [
  'id: "creative-strategist-v1"',
  'defaultBundleId: "creative-strategist-v1"',
  'type: "worker"',
  'executionMode: "export"',
  'activationModes: ["export"]',
  'id: "growthub-open-higgsfield-studio-v1"',
  'defaultBundleId: "growthub-open-higgsfield-studio-v1"',
]) {
  assert(catalogModule.includes(requiredToken), `Bundled kit catalog missing token: ${requiredToken}`);
}

for (const requiredToken of [
  "export function listBundledKits",
  "export function inspectBundledKit",
  "export function downloadBundledKit",
  "export function resolveKitPath",
  "export function validateKitDirectory",
  "export function copyBundledKitSource",
  "export function getBundledKitSourceInfo",
]) {
  assert(serviceModule.includes(requiredToken), `Kit service missing exported surface: ${requiredToken}`);
}

for (const requiredSnippet of [
  "growthub kit list",
  "growthub kit inspect creative-strategist-v1",
  "growthub kit inspect growthub-open-higgsfield-studio-v1",
  "growthub kit download creative-strategist-v1",
  "growthub kit download growthub-open-higgsfield-studio-v1",
  "growthub kit path creative-strategist-v1",
  "growthub kit validate /absolute/path/to/kit",
  "growthub kit sync init --kit growthub-postiz-social-v1 --fork-path ./forks/postiz",
  "growthub kit sync start my-postiz-fork",
  "growthub kit sync status my-postiz-fork",
  "How local adapters use worker kits",
]) {
  assert(cliReadme.includes(requiredSnippet), `CLI README missing required kit documentation: ${requiredSnippet}`);
}

console.log(
  [
    "cli-package-check passed",
    `@growthub/cli@${cliPkg.version}`,
    `create-growthub-local@${createPkg.version}`,
  ].join("\n"),
);
