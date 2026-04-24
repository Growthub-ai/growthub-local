#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const envFile = resolve(ROOT, ".env.local");

if (existsSync(envFile)) {
  const lines = readFileSync(envFile, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.join("=")) process.env[key] = rest.join("=");
  }
}

const REQUIRED = [
  "CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER",
  "ELEVENLABS_API_KEY",
];

const ADAPTER_DEPS = {
  "growthub-pipeline": ["GROWTHUB_BRIDGE_ACCESS_TOKEN", "GROWTHUB_BRIDGE_BASE_URL"],
  "byo-api-key": ["VIDEO_MODEL_PROVIDER"],
};

const errors = [];

for (const key of REQUIRED) {
  if (!process.env[key]) errors.push(`Missing required: ${key}`);
}

const adapter = process.env.CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER ?? "growthub-pipeline";
const adapterDeps = ADAPTER_DEPS[adapter] ?? [];
for (const key of adapterDeps) {
  if (!process.env[key]) errors.push(`Missing for ${adapter} adapter: ${key}`);
}

if (!process.env.VIDEO_USE_HOME) {
  errors.push("Missing VIDEO_USE_HOME (required for Stage 3)");
}

if (errors.length) {
  console.error("Environment verification failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
} else {
  console.log("Environment verified.");
}
