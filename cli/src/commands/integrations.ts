/**
 * `growthub integrations` — render Growthub-connected first-party integrations
 * through the CLI via the existing hosted bridge transport.
 *
 * Purely a thin view layer over `cli/src/integrations/bridge.ts`. No
 * transport, no caching, no credential persistence — all owned by the bridge.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  describeIntegrationBridge,
  listConnectedIntegrations,
  resolveIntegrationCredential,
} from "../integrations/bridge.js";

export async function integrationsStatus(opts: { json?: boolean } = {}): Promise<void> {
  const status = await describeIntegrationBridge();
  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  if (!status.growthubConnected) {
    p.log.warn(status.notice ?? "Not logged into Growthub.");
    return;
  }
  p.log.message(`Growthub: ${pc.green("connected")}  as ${status.growthubLogin ?? "?"}`);
  if (!status.bridgeAvailable) {
    p.log.info(status.notice ?? "Hosted integrations endpoint not available.");
    return;
  }
  if (status.integrations.length === 0) {
    p.log.info("No first-party integrations connected in your Growthub account.");
    return;
  }
  for (const i of status.integrations) {
    const ready = i.ready ? pc.green("ready") : pc.yellow("reauth needed");
    p.log.message(
      `  • ${pc.cyan(i.provider)}  ${ready}  handle=${i.handle ?? "?"}  ` +
      `scopes=[${(i.scopes ?? []).join(", ")}]`,
    );
  }
}

export async function integrationsList(opts: { json?: boolean } = {}): Promise<void> {
  const integrations = await listConnectedIntegrations();
  if (opts.json) {
    console.log(JSON.stringify({ integrations }, null, 2));
    return;
  }
  if (integrations.length === 0) {
    p.log.info("No first-party integrations connected in your Growthub account.");
    return;
  }
  for (const i of integrations) {
    p.log.message(`${pc.cyan(i.provider)}  ${i.handle ?? ""}  (ready=${i.ready})`);
  }
}

export async function integrationsProbe(opts: { provider: string; json?: boolean }): Promise<void> {
  const cred = await resolveIntegrationCredential(opts.provider);
  if (opts.json) {
    console.log(JSON.stringify({
      provider: opts.provider,
      resolved: Boolean(cred),
      handle: cred?.handle ?? null,
      scopes: cred?.scopes ?? null,
      expiresAt: cred?.expiresAt ?? null,
      source: cred?.source ?? null,
    }, null, 2));
    return;
  }
  if (!cred) {
    p.log.warn(
      `Unable to resolve a credential for '${opts.provider}' via the Growthub bridge. ` +
      `Ensure you are logged into Growthub and the integration is connected in gh-app.`,
    );
    return;
  }
  p.log.success(
    `Resolved ${pc.cyan(opts.provider)} credential via ${cred.source}  ` +
    `handle=${cred.handle ?? "?"}  scopes=[${(cred.scopes ?? []).join(", ")}]`,
  );
}

export function registerIntegrationsCommands(program: Command): void {
  const integrations = program
    .command("integrations")
    .description("Render Growthub-connected first-party integrations through the CLI.");

  integrations
    .command("status")
    .description("Show bridge state + all connected integrations.")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => {
      await integrationsStatus(opts);
    });

  integrations
    .command("list")
    .description("List integrations the user has connected inside their Growthub account.")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => {
      await integrationsList(opts);
    });

  integrations
    .command("probe")
    .description("Probe credential resolution for a specific provider (e.g. github).")
    .requiredOption("--provider <id>", "Provider id to probe (e.g. github)")
    .option("--json", "Emit machine-readable output")
    .action(async (opts) => {
      await integrationsProbe(opts);
    });
}
