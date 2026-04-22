import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error(".env not found. Run: cp .env.example .env");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
// Canonical: HYPERFRAMES_HOME. Legacy alias: HYPERFRAMES_LOCAL_PATH.
if (!raw.includes("HYPERFRAMES_HOME=") && !raw.includes("HYPERFRAMES_LOCAL_PATH=")) {
  console.error("HYPERFRAMES_HOME (or legacy HYPERFRAMES_LOCAL_PATH) is required in .env");
  process.exit(1);
}

console.log("Environment check passed.");
