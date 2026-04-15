#!/usr/bin/env node
// verify-env.mjs — Validate Twenty CRM credentials and API connectivity.
// Usage: node setup/verify-env.mjs
// Exit 0 = credentials are valid and API is reachable. Exit 1 = missing, invalid, or unreachable.

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
    console.error("Run: cp .env.example .env  then set your TWENTY_API_TOKEN and TWENTY_API_URL.");
    process.exit(1);
  }

  const env = parseEnvFile(envPath);
  const apiToken = env["TWENTY_API_TOKEN"];
  const apiUrl = env["TWENTY_API_URL"] ?? "https://api.twenty.com";

  if (!apiToken || apiToken === "your_twenty_api_token_here" || apiToken.trim() === "") {
    console.error("ERROR: TWENTY_API_TOKEN is not set in .env.");
    console.error("Generate a token in your Twenty workspace: Settings > API > Tokens");
    process.exit(1);
  }

  console.log(`Verifying token against ${apiUrl} ...`);

  const graphqlQuery = JSON.stringify({
    query: "{ currentWorkspace { id displayName } }",
  });

  let res;
  try {
    res = await fetch(`${apiUrl}/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: graphqlQuery,
    });
  } catch (err) {
    console.error(`ERROR: Could not reach ${apiUrl}.`);
    console.error(err.message);
    console.error("");
    console.error("If using local-fork mode, ensure Twenty is running via Docker Compose.");
    console.error("Run: bash setup/clone-fork.sh");
    process.exit(1);
  }

  if (res.status === 401 || res.status === 403) {
    console.error(`ERROR: API token rejected (HTTP ${res.status}).`);
    console.error("Check your TWENTY_API_TOKEN in .env — generate a new one at Settings > API > Tokens.");
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`ERROR: Unexpected response from Twenty API (HTTP ${res.status}).`);
    process.exit(1);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    console.error("ERROR: Could not parse API response as JSON.");
    process.exit(1);
  }

  if (body.errors && body.errors.length > 0) {
    console.error("ERROR: GraphQL error from Twenty API:");
    for (const err of body.errors) {
      console.error(` - ${err.message}`);
    }
    process.exit(1);
  }

  const workspace = body?.data?.currentWorkspace;
  if (workspace) {
    console.log(`OK: Connected to workspace "${workspace.displayName}" (id: ${workspace.id})`);
  } else {
    console.log("OK: TWENTY_API_TOKEN is valid and the API is reachable.");
  }

  process.exit(0);
}

main();
