/**
 * CLI Commands — policy
 *
 * Read-first view of the fork policy (`<forkPath>/.growthub-fork/policy.json`)
 * plus a capability-level policy check that mirrors the v1 shape in
 * `@growthub/api-contract/metrics` (allowedCapabilities, allowedProviders,
 * perProviderRateLimits, dataResidency).
 *
 *   growthub policy show                — print the full policy
 *   growthub policy check <slug>        — evaluate a capability slug against policy
 *   growthub policy providers           — list allowed / disallowed providers
 *
 * Writing policy remains an existing concern of kit-fork commands; this file
 * does not mutate the policy file.
 */

import pc from "picocolors";
import { Command } from "commander";
import { readKitForkPolicy } from "../kits/fork-policy.js";
import type { PolicyDocument, PolicyEvaluationResult, PolicyObservation } from "@growthub/api-contract/metrics";

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

/**
 * Narrow v1 policy projection — forks may carry extra fields under
 * `policy.metadata`; this function reads the recognized v1 keys.
 */
function projectV1PolicyDocument(rawPolicy: Record<string, unknown>): PolicyDocument {
  const metadata = (rawPolicy.metadata ?? {}) as Record<string, unknown>;

  const allowedCapabilities = Array.isArray(metadata.allowedCapabilities)
    ? metadata.allowedCapabilities.filter((x): x is string => typeof x === "string")
    : undefined;
  const allowedProviders = Array.isArray(metadata.allowedProviders)
    ? metadata.allowedProviders.filter((x): x is string => typeof x === "string")
    : undefined;
  const dataResidency = typeof metadata.dataResidency === "string" ? metadata.dataResidency : undefined;
  const perProviderRateLimits =
    metadata.perProviderRateLimits && typeof metadata.perProviderRateLimits === "object"
      ? (metadata.perProviderRateLimits as Record<string, number>)
      : undefined;
  const notes = typeof metadata.notes === "string" ? metadata.notes : undefined;

  return {
    version: 1,
    allowedCapabilities,
    allowedProviders,
    dataResidency,
    perProviderRateLimits,
    notes,
  };
}

function evaluateCapability(doc: PolicyDocument, slug: string): PolicyEvaluationResult {
  const observations: PolicyObservation[] = [];
  const at = new Date().toISOString();
  if (!doc.allowedCapabilities || doc.allowedCapabilities.length === 0) {
    observations.push({
      key: "allowedCapabilities",
      subject: slug,
      outcome: "skipped",
      reason: "policy does not restrict capabilities (unrestricted default)",
      evaluatedAt: at,
    });
    return { allowed: true, reason: "unrestricted by policy", observations };
  }
  const allowed = doc.allowedCapabilities.includes(slug);
  observations.push({
    key: "allowedCapabilities",
    subject: slug,
    outcome: allowed ? "allowed" : "denied",
    reason: allowed
      ? "slug present in allowedCapabilities"
      : "slug not in allowedCapabilities",
    evaluatedAt: at,
  });
  return {
    allowed,
    reason: allowed ? "slug allowed" : "slug not in allowedCapabilities",
    observations,
  };
}

export function registerPolicyCommands(program: Command): void {
  const policy = program
    .command("policy")
    .description("Inspect the fork policy (.growthub-fork/policy.json)");

  policy
    .command("show")
    .description("Print the fork policy document")
    .option("--fork <path>", "Target fork path (defaults to cwd)")
    .option("--json", "Output raw JSON")
    .action(async (opts: { fork?: string; json?: boolean }) => {
      const forkPath = opts.fork ?? process.cwd();
      const raw = readKitForkPolicy(forkPath) as unknown as Record<string, unknown>;
      const v1 = projectV1PolicyDocument(raw);

      if (opts.json) {
        console.log(JSON.stringify({ raw, v1 }, null, 2));
        return;
      }

      console.log("");
      console.log(pc.bold("Fork Policy"));
      console.log(hr());
      console.log(`  ${pc.dim("Fork:")}               ${forkPath}`);
      console.log(`  ${pc.dim("Auto-approve:")}       ${raw.autoApprove}`);
      console.log(`  ${pc.dim("Auto-approve deps:")}  ${raw.autoApproveDepUpdates}`);
      console.log(`  ${pc.dim("Remote sync mode:")}   ${raw.remoteSyncMode}`);
      console.log(`  ${pc.dim("Untouchable paths:")}  ${(raw.untouchablePaths as string[] | undefined)?.length ?? 0}`);
      console.log(`  ${pc.dim("Confirm paths:")}      ${(raw.confirmBeforeChange as string[] | undefined)?.length ?? 0}`);
      console.log(`  ${pc.dim("Allowed scripts:")}    ${(raw.allowedScripts as string[] | undefined)?.length ?? 0}`);
      console.log(hr());
      console.log(`  ${pc.bold("v1 policy projection")}`);
      console.log(`  ${pc.dim("allowedCapabilities:")}   ${v1.allowedCapabilities?.join(", ") ?? pc.dim("(unrestricted)")}`);
      console.log(`  ${pc.dim("allowedProviders:")}      ${v1.allowedProviders?.join(", ") ?? pc.dim("(unrestricted)")}`);
      console.log(`  ${pc.dim("dataResidency:")}         ${v1.dataResidency ?? pc.dim("(unset)")}`);
      console.log(`  ${pc.dim("perProviderRateLimits:")} ${v1.perProviderRateLimits ? Object.entries(v1.perProviderRateLimits).map(([k, v]) => `${k}:${v}/min`).join(", ") : pc.dim("(unset)")}`);
      if (v1.notes) console.log(`  ${pc.dim("notes:")}                 ${v1.notes}`);
      console.log("");
    });

  policy
    .command("check")
    .description("Evaluate a capability slug against fork policy")
    .argument("<slug>", "Capability slug to evaluate")
    .option("--fork <path>", "Target fork path (defaults to cwd)")
    .option("--json", "Output raw JSON")
    .action(async (slug: string, opts: { fork?: string; json?: boolean }) => {
      const forkPath = opts.fork ?? process.cwd();
      const raw = readKitForkPolicy(forkPath) as unknown as Record<string, unknown>;
      const doc = projectV1PolicyDocument(raw);
      const verdict = evaluateCapability(doc, slug);

      if (opts.json) {
        console.log(JSON.stringify(verdict, null, 2));
      } else {
        if (verdict.allowed) {
          console.log(pc.green(`✓ ${slug} allowed — ${verdict.reason}`));
        } else {
          console.error(pc.red(`✗ ${slug} denied — ${verdict.reason}`));
        }
        for (const obs of verdict.observations) {
          console.log(pc.dim(`  - ${obs.key}:${obs.subject} ${obs.outcome} (${obs.reason})`));
        }
      }
      process.exitCode = verdict.allowed ? 0 : 1;
    });

  policy
    .command("providers")
    .description("List allowed providers declared in the fork policy")
    .option("--fork <path>", "Target fork path (defaults to cwd)")
    .option("--json", "Output raw JSON")
    .action(async (opts: { fork?: string; json?: boolean }) => {
      const forkPath = opts.fork ?? process.cwd();
      const raw = readKitForkPolicy(forkPath) as unknown as Record<string, unknown>;
      const doc = projectV1PolicyDocument(raw);

      if (opts.json) {
        console.log(JSON.stringify(doc, null, 2));
        return;
      }

      console.log("");
      console.log(pc.bold("Policy Providers"));
      console.log(hr());
      console.log(`  ${pc.dim("allowedProviders:")}   ${doc.allowedProviders?.join(", ") ?? pc.dim("(unrestricted)")}`);
      if (doc.perProviderRateLimits) {
        for (const [provider, limit] of Object.entries(doc.perProviderRateLimits)) {
          console.log(`  ${pc.dim("limit:")}  ${provider}: ${limit} calls/min`);
        }
      }
      console.log("");
    });
}
