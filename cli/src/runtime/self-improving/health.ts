/**
 * Self-Improving Workspace — health specialization checks.
 *
 * Detects self-improving workspace features on a kit-exported directory
 * and returns structured check objects compatible with KitHealthCheck.
 * Called by the kit-health composer when the kit id matches.
 */

import fs from "node:fs";
import path from "node:path";

export interface SelfImprovingHealthCheck {
  id: string;
  severity: "pass" | "warn" | "fail" | "info";
  label: string;
  message?: string;
  remediation?: string;
  category: "self-improving";
  evidence?: Record<string, unknown>;
}

function isFile(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isDir(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function check(
  id: string,
  severity: SelfImprovingHealthCheck["severity"],
  label: string,
  opts: Pick<SelfImprovingHealthCheck, "message" | "remediation" | "evidence"> = {},
): SelfImprovingHealthCheck {
  return { id, severity, label, category: "self-improving", ...opts };
}

export interface SelfImprovingHealthSummary {
  detected: boolean;
  checks: SelfImprovingHealthCheck[];
  proposalCount: number;
  promotedCount: number;
}

/**
 * Run self-improving specialization checks against a fork root.
 * Safe to call on any kit — returns detected=false for non-self-improving kits.
 */
export function checkSelfImprovingHealth(forkRoot: string): SelfImprovingHealthSummary {
  const kitJsonPath = path.resolve(forkRoot, "kit.json");
  if (!isFile(kitJsonPath)) {
    return { detected: false, checks: [], proposalCount: 0, promotedCount: 0 };
  }

  let kitId = "";
  try {
    const parsed = JSON.parse(fs.readFileSync(kitJsonPath, "utf8")) as { kit?: { id?: string } };
    kitId = parsed.kit?.id ?? "";
  } catch {
    return { detected: false, checks: [], proposalCount: 0, promotedCount: 0 };
  }

  // Detect self-improving feature on ANY governed workspace that has the
  // capabilities dir — it's an optional feature extension, not a separate kit.
  const capabilitiesDir = path.resolve(forkRoot, ".growthub-fork", "capabilities");
  const hasCapabilities = isDir(capabilitiesDir);
  const hasHelpers = isFile(path.resolve(forkRoot, "helpers", "propose-capability.mjs"));
  if (!hasCapabilities && !hasHelpers) {
    return { detected: false, checks: [], proposalCount: 0, promotedCount: 0 };
  }

  const checks: SelfImprovingHealthCheck[] = [];
  const forkStateDir = path.resolve(forkRoot, ".growthub-fork");
  void kitId; // kitId used for detection above; forkStateDir used for checks below

  // proposals directory
  const proposalsDir = path.resolve(forkStateDir, "capabilities", "proposals");
  const proposalsExist = isDir(proposalsDir);
  checks.push(check(
    "si-proposals-dir",
    proposalsExist ? "pass" : "info",
    ".growthub-fork/capabilities/proposals/ exists",
    {
      message: proposalsExist ? undefined : "No proposals yet — run: growthub workspace improve propose --from-run demo",
      remediation: proposalsExist ? undefined : "growthub workspace improve propose --from-run <run-id>",
    },
  ));

  let proposalCount = 0;
  if (proposalsExist) {
    const files = fs.readdirSync(proposalsDir).filter((f) => f.endsWith(".json"));
    proposalCount = files.length;

    // Validate each proposal JSON
    let invalidCount = 0;
    for (const f of files) {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.resolve(proposalsDir, f), "utf8")) as { kind?: string };
        if (parsed.kind !== "growthub-capability-proposal") invalidCount++;
      } catch {
        invalidCount++;
      }
    }
    checks.push(check(
      "si-proposals-valid",
      invalidCount === 0 ? "pass" : "warn",
      `${files.length} proposal file(s) — ${invalidCount} invalid`,
      {
        evidence: { proposalCount: files.length, invalidCount },
        remediation: invalidCount > 0 ? "Remove or fix invalid JSON files in .growthub-fork/capabilities/proposals/" : undefined,
      },
    ));
  }

  // promoted directory
  const promotedDir = path.resolve(forkStateDir, "capabilities", "promoted");
  const promotedExist = isDir(promotedDir);
  let promotedCount = 0;
  if (promotedExist) {
    promotedCount = fs.readdirSync(promotedDir).filter((f) => f.endsWith(".json")).length;
  }
  checks.push(check(
    "si-promoted-dir",
    "info",
    `${promotedCount} promoted capability/capabilities`,
    { evidence: { promotedCount } },
  ));

  // helper scripts
  const proposeHelper = path.resolve(forkRoot, "helpers", "propose-capability.mjs");
  checks.push(check(
    "si-propose-helper",
    isFile(proposeHelper) ? "pass" : "warn",
    "helpers/propose-capability.mjs",
    { remediation: isFile(proposeHelper) ? undefined : "Run: growthub kit heal <fork-id>" },
  ));

  const promoteHelper = path.resolve(forkRoot, "helpers", "promote-capability.mjs");
  checks.push(check(
    "si-promote-helper",
    isFile(promoteHelper) ? "pass" : "warn",
    "helpers/promote-capability.mjs",
    { remediation: isFile(promoteHelper) ? undefined : "Run: growthub kit heal <fork-id>" },
  ));

  // agent bindings (optional but detected)
  const agentsDir = path.resolve(forkStateDir, "agents");
  const hasAgentBindings = isDir(agentsDir) && fs.readdirSync(agentsDir).some((f) => f.endsWith(".json"));
  checks.push(check(
    "si-agent-bindings",
    hasAgentBindings ? "pass" : "info",
    hasAgentBindings ? "Hosted agent bindings detected" : "No hosted agent bindings (optional)",
    { message: hasAgentBindings ? undefined : "Bind a hosted agent with: growthub bridge agents bind <slug> --fork ." },
  ));

  // trace.jsonl presence
  const traceJsonl = path.resolve(forkStateDir, "trace.jsonl");
  checks.push(check(
    "si-trace-jsonl",
    isFile(traceJsonl) ? "pass" : "warn",
    ".growthub-fork/trace.jsonl exists",
    { remediation: isFile(traceJsonl) ? undefined : "Register fork: growthub kit fork register ." },
  ));

  return { detected: true, checks, proposalCount, promotedCount };
}
