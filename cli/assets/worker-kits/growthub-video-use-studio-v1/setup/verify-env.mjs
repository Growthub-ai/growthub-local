import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error(".env not found. Run: cp .env.example .env");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");

// Canonical: VIDEO_USE_HOME. Legacy alias: VIDEO_USE_FORK_PATH.
if (!raw.includes("VIDEO_USE_HOME=") && !raw.includes("VIDEO_USE_FORK_PATH=")) {
  console.error("VIDEO_USE_HOME (or legacy VIDEO_USE_FORK_PATH) is required in .env");
  process.exit(1);
}

if (!/ELEVENLABS_API_KEY=\S/.test(raw) || /ELEVENLABS_API_KEY=your_elevenlabs_key_here/.test(raw)) {
  console.error("ELEVENLABS_API_KEY is required in .env (for ElevenLabs Scribe transcription)");
  process.exit(1);
}

console.log("Environment check passed.");
