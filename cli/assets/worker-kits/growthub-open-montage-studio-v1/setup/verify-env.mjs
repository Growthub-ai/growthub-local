#!/usr/bin/env node

/**
 * Verify environment configuration for Open Montage Studio.
 * Checks which providers are configured and validates key formats.
 * Exit 0: at least one provider configured or zero-key mode acknowledged.
 * Exit 1: configuration issue found.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(__dirname, "..");
const envPath = resolve(kitRoot, ".env");

// ── Parse .env ──

function parseEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const lines = readFileSync(filePath, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

// ── Provider definitions ──

const PROVIDERS = [
  { key: "FAL_KEY", name: "fal.ai", capabilities: "FLUX images, Kling/Veo/MiniMax video, Recraft", placeholder: "your_fal_key_here" },
  { key: "PEXELS_API_KEY", name: "Pexels", capabilities: "Free stock photos + videos", placeholder: "your_pexels_key_here" },
  { key: "PIXABAY_API_KEY", name: "Pixabay", capabilities: "Free stock photos + videos", placeholder: "your_pixabay_key_here" },
  { key: "UNSPLASH_ACCESS_KEY", name: "Unsplash", capabilities: "Free stock images", placeholder: "your_unsplash_key_here" },
  { key: "OPENAI_API_KEY", name: "OpenAI", capabilities: "DALL-E 3 images, OpenAI TTS", placeholder: "your_openai_key_here" },
  { key: "GOOGLE_API_KEY", name: "Google", capabilities: "Google TTS (700+ voices), Imagen images", placeholder: "your_google_key_here" },
  { key: "ELEVENLABS_API_KEY", name: "ElevenLabs", capabilities: "Premium TTS, music, SFX", placeholder: "your_elevenlabs_key_here" },
  { key: "SUNO_API_KEY", name: "Suno", capabilities: "AI music generation", placeholder: "your_suno_key_here" },
  { key: "RUNWAY_API_KEY", name: "Runway", capabilities: "Gen-4 video", placeholder: "your_runway_key_here" },
  { key: "HEYGEN_API_KEY", name: "HeyGen", capabilities: "Avatar videos", placeholder: "your_heygen_key_here" },
  { key: "HIGGSFIELD_API_KEY", name: "Higgsfield", capabilities: "Multi-model video orchestrator", placeholder: "your_higgsfield_key_here" },
  { key: "XAI_API_KEY", name: "xAI Grok", capabilities: "Image + video generation", placeholder: "your_xai_key_here" },
];

// ── Check ──

console.log("=== Open Montage Studio — Environment Check ===\n");

if (!existsSync(envPath)) {
  console.log("[error] .env file not found at:", envPath);
  console.log("        Run: cp .env.example .env");
  process.exit(1);
}

const env = parseEnv(envPath);
const configured = [];
const missing = [];

for (const provider of PROVIDERS) {
  const value = env[provider.key];
  if (value && value !== provider.placeholder && value.length > 5) {
    configured.push(provider);
    console.log(`  [ok] ${provider.name} — ${provider.capabilities}`);
  } else {
    missing.push(provider);
  }
}

console.log("");

if (configured.length === 0) {
  console.log("[info] No provider keys configured.");
  console.log("       You can still use:");
  console.log("       - GrowthHub CMS nodes (requires growthub auth:login)");
  console.log("       - Zero-key mode: Piper TTS + free archives + Remotion");
  console.log("");
  console.log("       To add providers, edit .env and rerun this script.");
  // Exit 0 — zero-key mode is valid
  process.exit(0);
}

console.log(`[summary] ${configured.length} provider(s) configured, ${missing.length} not set.`);

// Check OpenMontage path
const omPath = env.OPENMONTAGE_PATH || resolve(process.env.HOME || "~", "OpenMontage");
if (existsSync(omPath)) {
  console.log(`[ok] OpenMontage clone found at: ${omPath}`);
} else {
  console.log(`[info] OpenMontage not found at: ${omPath}`);
  console.log("       Run: bash setup/clone-fork.sh (optional — needed for local-fork mode only)");
}

console.log("\n=== Check Complete ===");
process.exit(0);
