/**
 * CLI Commands — authority
 *
 * Surfaces the already-existing authority subsystem (fork-authority.ts) as
 * a first-class CLI surface:
 *
 *   growthub authority show           — print the envelope + verification
 *   growthub authority verify          — verify only; non-zero on failure
 *   growthub authority issuers         — list paired trust-root issuers
 *
 * All heavy lifting — signing / verification / issuer registry — lives in
 * cli/src/kits/fork-authority.ts; this file only renders.
 */

import pc from "picocolors";
import { Command } from "commander";
import {
  readForkAuthorityState,
  readIssuerRegistry,
  verifyAuthorityEnvelope,
  describePolicyAttestation,
} from "../kits/fork-authority.js";
import { readKitForkPolicy } from "../kits/fork-policy.js";

function hr(width = 72): string {
  return pc.dim("─".repeat(width));
}

export function registerAuthorityCommands(program: Command): void {
  const auth = program
    .command("authority")
    .description("Fork authority envelope — show / verify / list issuers");

  auth
    .command("show")
    .description("Print the fork authority envelope and verification")
    .option("--fork <path>", "Target fork path (defaults to cwd)")
    .option("--json", "Output raw JSON")
    .action(async (opts: { fork?: string; json?: boolean }) => {
      const forkPath = opts.fork ?? process.cwd();
      const state = readForkAuthorityState(forkPath);
      const policy = readKitForkPolicy(forkPath);
      const attestation = describePolicyAttestation(forkPath, policy);

      if (opts.json) {
        console.log(JSON.stringify({ state, attestation }, null, 2));
        return;
      }

      console.log("");
      console.log(pc.bold("Fork Authority"));
      console.log(hr());
      console.log(`  ${pc.dim("Fork path:")}      ${forkPath}`);
      console.log(`  ${pc.dim("State:")}          ${state.state}`);
      if (state.state === "attested") {
        const verdict = verifyAuthorityEnvelope(state.envelope, { expectedForkPath: forkPath });
        const verdictStr = verdict.ok ? pc.green("ok") : pc.red(verdict.reason);
        const detail = verdict.ok ? "" : verdict.detail ? pc.dim(` — ${verdict.detail}`) : "";
        console.log(`  ${pc.dim("Verification:")}   ${verdictStr}${detail}`);
        console.log(`  ${pc.dim("Issuer:")}         ${state.envelope.issuerId}`);
        console.log(`  ${pc.dim("Subject kitId:")}  ${state.envelope.subject.kitId}`);
        console.log(`  ${pc.dim("Subject forkId:")} ${state.envelope.subject.forkId}`);
        if (state.envelope.expiresAt) {
          console.log(`  ${pc.dim("Expires:")}        ${state.envelope.expiresAt}`);
        }
        console.log(`  ${pc.dim("Grants:")}         ${state.envelope.grants.capabilities.join(", ") || pc.dim("(none)")}`);
      } else if (state.state === "revoked") {
        console.log(`  ${pc.dim("Revoked:")}        ${state.revocation.revokedAt}`);
        if (state.revocation.reason) {
          console.log(`  ${pc.dim("Reason:")}         ${state.revocation.reason}`);
        }
      }
      console.log(hr());
      console.log(`  ${pc.dim("Policy origin:")}  ${attestation.origin}`);
      if (attestation.policyHashMatches !== undefined) {
        console.log(`  ${pc.dim("Policy matches:")} ${attestation.policyHashMatches ? pc.green("yes") : pc.red("no")}`);
      }
      if (attestation.envelope) {
        console.log(`  ${pc.dim("Attested grants:")} ${attestation.envelope.grants.capabilities.join(", ") || pc.dim("(none)")}`);
      }
      console.log("");
    });

  auth
    .command("verify")
    .description("Verify the fork authority envelope; exit non-zero on failure")
    .option("--fork <path>", "Target fork path (defaults to cwd)")
    .option("--json", "Output raw JSON")
    .action(async (opts: { fork?: string; json?: boolean }) => {
      const forkPath = opts.fork ?? process.cwd();
      const state = readForkAuthorityState(forkPath);

      if (state.state !== "attested") {
        const payload = { ok: false, reason: state.state };
        if (opts.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.error(pc.red(`No envelope attached (state: ${state.state}).`));
        }
        process.exitCode = 1;
        return;
      }

      const verdict = verifyAuthorityEnvelope(state.envelope, {
        expectedForkPath: forkPath,
      });

      if (opts.json) {
        console.log(JSON.stringify(verdict, null, 2));
      } else if (verdict.ok) {
        console.log(pc.green("✓ Authority envelope is valid."));
      } else {
        console.error(pc.red(`✗ Authority envelope invalid: ${verdict.reason}`));
        if (verdict.detail) console.error(pc.dim(`  ${verdict.detail}`));
      }
      process.exitCode = verdict.ok ? 0 : 1;
    });

  auth
    .command("issuers")
    .description("List paired authority trust-root issuers")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const registry = readIssuerRegistry();
      if (opts.json) {
        console.log(JSON.stringify(registry, null, 2));
        return;
      }
      console.log("");
      console.log(pc.bold("Authority Issuers"));
      console.log(hr());
      if (registry.issuers.length === 0) {
        console.log(pc.dim("  (no issuers paired)"));
      } else {
        for (const issuer of registry.issuers) {
          console.log(`  ${pc.bold(issuer.id)}  ${pc.dim(issuer.kind)}`);
          if (issuer.label) console.log(`    ${pc.dim("label:")} ${issuer.label}`);
          if (issuer.addedAt) console.log(`    ${pc.dim("added:")} ${issuer.addedAt}`);
        }
      }
      console.log("");
    });
}
