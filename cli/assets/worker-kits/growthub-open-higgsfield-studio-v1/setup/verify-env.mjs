#!/usr/bin/env node
// verify-env.mjs — Validate MUAPI_API_KEY from .env before starting a generation session.
// Usage: node setup/verify-env.mjs
// Exit 0 = key is valid and reachable. Exit 1 = key missing, invalid, or API unreachable.

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
    console.error("Run: cp .env.example .env  then add your MUAPI_API_KEY.");
    process.exit(1);
  }

  const env = parseEnvFile(envPath);
  const apiKey = env["MUAPI_API_KEY"];
  const baseUrl = env["MUAPI_BASE_URL"] ?? "https://api.muapi.io";

  if (!apiKey || apiKey === "your_muapi_key_here" || apiKey.trim() === "") {
    console.error("ERROR: MUAPI_API_KEY is not set in .env.");
    console.error("Get your key at https://muapi.ai/dashboard");
    process.exit(1);
  }

  console.log(`Verifying key against ${baseUrl} ...`);

  let res;
  try {
    res = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers: { "x-api-key": apiKey },
    });
  } catch (err) {
    console.error(`ERROR: Could not reach ${baseUrl}.`);
    console.error(err.message);
    process.exit(1);
  }

  if (res.status === 401 || res.status === 403) {
    console.error(`ERROR: API key rejected (HTTP ${res.status}).`);
    console.error("Check your MUAPI_API_KEY value at https://muapi.ai/dashboard");
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`ERROR: Unexpected response from Muapi API (HTTP ${res.status}).`);
    process.exit(1);
  }

  console.log("OK: MUAPI_API_KEY is valid and the API is reachable.");
  process.exit(0);
}

main();
