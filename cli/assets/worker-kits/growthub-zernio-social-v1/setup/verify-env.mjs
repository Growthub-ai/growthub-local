#!/usr/bin/env node
// verify-env.mjs — Verify Zernio API key + profile + reachability for the kit
// Usage: node setup/verify-env.mjs

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let allPassed = true;
const results = [];

function check(label, passed, detail = "") {
  const icon = passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  results.push({ label, passed, detail, icon });
  if (!passed) allPassed = false;
}

function warn(label, detail = "") {
  results.push({ label, passed: null, detail, icon: `${YELLOW}⚠${RESET}` });
}

console.log("Growthub Zernio Social Media Studio — Environment Verification");
console.log("=".repeat(64));
console.log("");

// --- Check 1: ZERNIO_API_KEY format ---
const ZERNIO_KEY_RE = /^sk_[0-9a-fA-F]{64}$/;
const zernioKey = process.env.ZERNIO_API_KEY;
let zernioKeyValid = false;
if (!zernioKey || zernioKey === "your_zernio_api_key_here") {
  warn("ZERNIO_API_KEY not set", "Set it in .env. Agent-only mode is still available.");
} else if (!ZERNIO_KEY_RE.test(zernioKey)) {
  check("ZERNIO_API_KEY format is valid", false, "Key must match sk_ + 64 hex characters");
} else {
  check("ZERNIO_API_KEY format is valid", true, zernioKey.slice(0, 8) + "...");
  zernioKeyValid = true;
}

// --- Check 2: ZERNIO_API_URL present ---
const zernioApiUrl = process.env.ZERNIO_API_URL ?? "https://zernio.com/api/v1";
check("ZERNIO_API_URL is set", Boolean(zernioApiUrl), zernioApiUrl);

// --- Check 3: Zernio API reachable (only if a plausible key exists) ---
let apiReachable = false;
if (zernioKeyValid) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${zernioApiUrl}/profiles`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${zernioKey}` },
    });
    clearTimeout(timeout);
    apiReachable = res.ok;
    if (!res.ok) {
      check("Zernio API accepts the key", false, `HTTP ${res.status} from GET ${zernioApiUrl}/profiles`);
    } else {
      check("Zernio API accepts the key", true, `HTTP 200 from GET ${zernioApiUrl}/profiles`);
    }
  } catch (err) {
    check("Zernio API is reachable", false, `Could not reach ${zernioApiUrl} — ${String(err?.message ?? err).slice(0, 120)}`);
  }
} else {
  warn("Zernio API reachability skipped", "No valid ZERNIO_API_KEY — agent-only mode only");
}

// --- Check 4: ZERNIO_PROFILE_ID ---
const profileId = process.env.ZERNIO_PROFILE_ID;
if (!profileId || profileId === "your_zernio_profile_id_here") {
  warn("ZERNIO_PROFILE_ID not set", "Required for scheduling — find it in the Zernio dashboard or via GET /api/v1/profiles");
} else if (zernioKeyValid && apiReachable) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${zernioApiUrl}/profiles/${encodeURIComponent(profileId)}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${zernioKey}` },
    });
    clearTimeout(timeout);
    if (res.ok) {
      check("ZERNIO_PROFILE_ID exists on the account", true, profileId.slice(0, 16) + "...");
    } else if (res.status === 404) {
      check("ZERNIO_PROFILE_ID exists on the account", false, "Profile not found for this API key");
    } else {
      warn("ZERNIO_PROFILE_ID lookup returned non-2xx", `HTTP ${res.status}`);
    }
  } catch (err) {
    warn("ZERNIO_PROFILE_ID lookup failed", String(err?.message ?? err).slice(0, 120));
  }
} else {
  check("ZERNIO_PROFILE_ID is set", true, "Format check only — API not reached");
}

// --- Check 5: ZERNIO_TIMEZONE plausibility (optional) ---
const tz = process.env.ZERNIO_TIMEZONE;
if (tz) {
  // minimum sanity: looks like "Area/City" or a UTC offset tag
  const plausible = /^[A-Za-z]+\/[A-Za-z_]+/.test(tz) || /^UTC[+-]?\d*$/i.test(tz);
  if (plausible) {
    check("ZERNIO_TIMEZONE format is plausible", true, tz);
  } else {
    check("ZERNIO_TIMEZONE format is plausible", false, `Unexpected value: ${tz}`);
  }
}

// --- Check 6: Anthropic API key (optional) ---
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicKey || anthropicKey === "your_anthropic_key_here") {
  warn("ANTHROPIC_API_KEY not set", "Optional — used only for enhanced caption drafting in hybrid mode");
} else if (anthropicKey.startsWith("sk-ant-")) {
  check("ANTHROPIC_API_KEY format is valid", true);
} else {
  check("ANTHROPIC_API_KEY format is valid", false, "Key does not start with sk-ant- — check your Anthropic console");
}

// --- Print results ---
console.log("Results:");
for (const { icon, label, detail } of results) {
  const detailStr = detail ? `  → ${detail}` : "";
  console.log(`  ${icon}  ${label}${detailStr}`);
}

console.log("");

if (allPassed) {
  console.log(`${GREEN}All checks passed. Ready for api-live or hybrid mode.${RESET}`);
} else {
  const warnings = results.filter((r) => r.passed === null);
  const failures = results.filter((r) => r.passed === false);
  if (failures.length > 0) {
    console.log(`${RED}${failures.length} check(s) failed. See details above.${RESET}`);
    console.log(`\n  Agent-only mode remains available for campaign planning and dry-run manifests.`);
  }
  if (warnings.length > 0 && failures.length === 0) {
    console.log(`${YELLOW}Checks passed with warnings. Agent-only mode is available.${RESET}`);
  }
}
