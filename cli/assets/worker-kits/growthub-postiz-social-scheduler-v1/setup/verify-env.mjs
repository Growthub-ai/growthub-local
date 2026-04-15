#!/usr/bin/env node
// verify-env.mjs — Validate Postiz instance configuration from .env before starting a session.
// Usage: node setup/verify-env.mjs
// Exit 0 = instance is reachable. Exit 1 = config missing or instance unreachable.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");

function parseEnvFile(filePath) {
  const vars = {};
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    vars[key] = value;
  }
  return vars;
}

async function main() {
  if (!existsSync(envPath)) {
    console.error("ERROR: .env file not found.");
    console.error("Run: cp .env.example .env  then configure your Postiz instance settings.");
    process.exit(1);
  }

  const env = parseEnvFile(envPath);
  const postizUrl = env["POSTIZ_URL"];

  if (!postizUrl || postizUrl.trim() === "") {
    console.error("ERROR: POSTIZ_URL is not set in .env.");
    console.error("Set it to your Postiz instance URL (e.g. http://localhost:5000).");
    process.exit(1);
  }

  console.log(`Verifying Postiz instance at ${postizUrl} ...`);

  let res;
  try {
    res = await fetch(postizUrl, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error(`ERROR: Could not reach Postiz at ${postizUrl}.`);
    console.error(err.message);
    console.error("");
    console.error("If running locally, start with: bash setup/clone-fork.sh");
    process.exit(1);
  }

  if (!res.ok && res.status !== 302 && res.status !== 301) {
    console.error(`WARNING: Postiz responded with HTTP ${res.status}.`);
    console.error("The instance may be starting up or misconfigured.");
    console.error("Check the Postiz logs for more details.");
    process.exit(1);
  }

  console.log(`OK: Postiz instance is reachable at ${postizUrl}.`);

  // Check API key if set
  const apiKey = env["POSTIZ_API_KEY"];
  if (apiKey && apiKey !== "your_postiz_api_key_here" && apiKey.trim() !== "") {
    console.log("OK: POSTIZ_API_KEY is configured.");
  } else {
    console.log("NOTE: POSTIZ_API_KEY is not set. API-direct mode will not be available.");
    console.log("      This is fine for browser-hosted and local-fork UI modes.");
  }

  process.exit(0);
}

main();
