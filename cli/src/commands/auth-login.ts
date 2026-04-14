import os from "node:os";
import * as p from "@clack/prompts";
import pc from "picocolors";
import open from "open";
import { readConfig, resolveConfigPath } from "../config/store.js";
import { loadPaperclipEnvFile } from "../config/env.js";
import { startLoginFlow } from "../auth/login-flow.js";
import { writeSession, clearSession, readSession, describeSessionPath } from "../auth/session-store.js";
import {
  clearHostedOverlay,
  readHostedOverlay,
  seedHostedOverlayFromSession,
  writeHostedOverlay,
  describeHostedOverlayPath,
} from "../auth/overlay-store.js";
import {
  computeEffectiveProfile,
  writeEffectiveProfileSnapshot,
} from "../auth/effective-profile.js";
import { resolvePaperclipInstanceId } from "../config/home.js";
import { isSessionExpired } from "../auth/session-store.js";
import { fetchHostedSession } from "../auth/hosted-client.js";

const DEFAULT_HOSTED_BASE_URL = "https://www.growthub.ai";

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveHostedBaseUrl(opts: {
  baseUrl?: string;
  configPath?: string;
}): string {
  const explicit = opts.baseUrl?.trim();
  if (explicit) return trimSlashes(explicit);

  const envBase = process.env.GROWTHUB_BASE_URL?.trim();
  if (envBase) return trimSlashes(envBase);

  try {
    const config = readConfig(opts.configPath);
    const configuredBase = config?.auth?.growthubBaseUrl?.trim();
    if (configuredBase) return trimSlashes(configuredBase);
    const portalBase = config?.auth?.growthubPortalBaseUrl?.trim();
    if (portalBase) return trimSlashes(portalBase);
  } catch {
    // fall through
  }

  return DEFAULT_HOSTED_BASE_URL;
}

export interface AuthLoginOptions {
  config?: string;
  dataDir?: string;
  baseUrl?: string;
  token?: string;
  machineLabel?: string;
  workspaceLabel?: string;
  timeoutMs?: number;
  noBrowser?: boolean;
  json?: boolean;
}

export async function authLogin(opts: AuthLoginOptions): Promise<void> {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);

  const hostedBaseUrl = resolveHostedBaseUrl({ baseUrl: opts.baseUrl, configPath: opts.config });
  const machineLabel = opts.machineLabel?.trim() || os.hostname();
  const workspaceLabel = opts.workspaceLabel?.trim();
  const linkedInstanceId = resolvePaperclipInstanceId();
  const existingSession = readSession();

  if (!opts.token && existingSession && !isSessionExpired(existingSession)) {
    const sameBaseUrl = trimSlashes(existingSession.hostedBaseUrl) === hostedBaseUrl;
    if (sameBaseUrl) {
      try {
        await fetchHostedSession(existingSession);
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                status: "ok",
                hostedBaseUrl,
                userId: existingSession.userId ?? null,
                email: existingSession.email ?? null,
                reusedSession: true,
              },
              null,
              2,
            ),
          );
          return;
        }

        p.log.success(
          `Already connected${existingSession.email ? ` as ${existingSession.email}` : ""}.`,
        );
        if (existingSession.hostedBaseUrl) {
          p.log.message(pc.dim(`Hosted: ${existingSession.hostedBaseUrl}`));
        }
        return;
      } catch {
        clearSession();
      }
    }
  }

  // Scripted / CI path: accept a hosted-minted token directly.
  if (opts.token) {
    const now = new Date().toISOString();
    writeSession({
      version: 1,
      hostedBaseUrl,
      accessToken: opts.token.trim(),
      issuedAt: now,
      machineLabel,
    });

    const existingOverlay = readHostedOverlay();
    const overlay =
      existingOverlay ??
      seedHostedOverlayFromSession({
        hostedBaseUrl,
        machineLabel,
        linkedInstanceId,
      });

    writeHostedOverlay({
      ...overlay,
      hostedBaseUrl,
      linkedInstanceId: overlay.linkedInstanceId ?? linkedInstanceId,
    });

    const effective = computeEffectiveProfile({ configPath });
    writeEffectiveProfileSnapshot(effective);

    if (opts.json) {
      console.log(JSON.stringify({ status: "ok", hostedBaseUrl, mode: "token" }, null, 2));
    } else {
      p.log.success("Saved hosted session from --token.");
      p.log.message(pc.dim(`Session: ${describeSessionPath()}`));
      p.log.message(pc.dim(`Overlay: ${describeHostedOverlayPath()}`));
    }
    return;
  }

  p.intro(pc.bgCyan(pc.black(" growthub auth login ")));
  p.log.message(pc.dim(`Hosted app: ${hostedBaseUrl}`));

  const flow = await startLoginFlow({
    hostedBaseUrl,
    machineLabel,
    workspaceLabel,
    timeoutMs: opts.timeoutMs,
  });

  if (!opts.noBrowser) {
    try {
      p.log.message("Opening browser to complete sign-in…");
      await open(flow.loginUrl);
    } catch (err) {
      p.log.warn(`Could not launch browser automatically: ${err instanceof Error ? err.message : String(err)}`);
      p.log.message(pc.dim("Paste this URL into a browser:"));
      p.log.message(pc.cyan(flow.loginUrl));
    }
  } else {
    p.log.message(pc.dim("Paste this URL into a browser:"));
    p.log.message(pc.cyan(flow.loginUrl));
  }

  const spinner = p.spinner();
  spinner.start("Waiting for hosted app to complete the exchange…");

  try {
    const result = await flow.waitForCallback();
    spinner.stop("Received hosted session token.");

    const nowIso = new Date().toISOString();
    writeSession({
      version: 1,
      hostedBaseUrl: result.hostedBaseUrl,
      accessToken: result.token,
      expiresAt: result.expiresAt,
      userId: result.userId,
      email: result.email,
      orgId: result.orgId,
      orgName: result.orgName,
      machineLabel: result.machineLabel,
      issuedAt: nowIso,
    });

    const existingOverlay = readHostedOverlay();
    const overlay = existingOverlay
      ? {
          ...existingOverlay,
          hostedBaseUrl: result.hostedBaseUrl,
          userId: result.userId ?? existingOverlay.userId,
          email: result.email ?? existingOverlay.email,
          displayName: result.email ?? existingOverlay.displayName,
          orgId: result.orgId ?? existingOverlay.orgId,
          orgName: result.orgName ?? existingOverlay.orgName,
          linkedInstanceId: existingOverlay.linkedInstanceId ?? linkedInstanceId,
        }
      : seedHostedOverlayFromSession({
          hostedBaseUrl: result.hostedBaseUrl,
          userId: result.userId,
          email: result.email,
          orgId: result.orgId,
          orgName: result.orgName,
          machineLabel: result.machineLabel,
          linkedInstanceId,
        });

    writeHostedOverlay(overlay);

    const effective = computeEffectiveProfile({ configPath });
    writeEffectiveProfileSnapshot(effective);

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            status: "ok",
            hostedBaseUrl: result.hostedBaseUrl,
            userId: result.userId ?? null,
            email: result.email ?? null,
            orgId: result.orgId ?? null,
          },
          null,
          2,
        ),
      );
    } else {
      p.log.success(`Signed in${result.email ? ` as ${result.email}` : ""}.`);
      p.log.message(pc.dim(`Session: ${describeSessionPath()}`));
    }

    p.outro("Done");
  } catch (err) {
    spinner.stop("Login failed.");
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    flow.close();
  }
}

export interface AuthLogoutOptions {
  config?: string;
  keepOverlay?: boolean;
  json?: boolean;
}

export async function authLogout(opts: AuthLogoutOptions): Promise<void> {
  const sessionCleared = clearSession();
  const overlayCleared = opts.keepOverlay ? false : clearHostedOverlay();

  const effective = computeEffectiveProfile({ configPath: resolveConfigPath(opts.config) });
  writeEffectiveProfileSnapshot(effective);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          status: "ok",
          sessionCleared,
          overlayCleared,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!sessionCleared && !overlayCleared) {
    console.log(pc.dim("No hosted session or overlay present. Local workspace profile is untouched."));
    return;
  }

  if (sessionCleared) console.log(pc.green("Cleared hosted session."));
  if (overlayCleared) console.log(pc.green("Cleared hosted overlay."));
  console.log(pc.dim("Local workspace profile is untouched."));
}

export interface AuthWhoamiOptions {
  config?: string;
  json?: boolean;
}

export async function authWhoami(opts: AuthWhoamiOptions): Promise<void> {
  const session = readSession();
  const overlay = readHostedOverlay();
  const effective = computeEffectiveProfile({ configPath: resolveConfigPath(opts.config) });

  const payload = {
    authenticated: effective.authenticated,
    hostedBaseUrl: session?.hostedBaseUrl ?? overlay?.hostedBaseUrl ?? null,
    userId: overlay?.userId ?? session?.userId ?? null,
    email: overlay?.email ?? session?.email ?? null,
    displayName: overlay?.displayName ?? null,
    orgId: overlay?.orgId ?? session?.orgId ?? null,
    orgName: overlay?.orgName ?? session?.orgName ?? null,
    entitlements: overlay?.entitlements ?? [],
    linkedInstanceId: overlay?.linkedInstanceId ?? null,
    session: {
      present: Boolean(session),
      expired: effective.session.expired,
      expiresAt: effective.session.expiresAt,
    },
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!payload.authenticated) {
    console.log(pc.yellow("Not signed in."));
    if (effective.session.present && effective.session.expired) {
      console.log(pc.dim("Hosted session exists but is expired. Run `growthub auth login` to refresh."));
    } else {
      console.log(pc.dim("Run `growthub auth login` to connect this CLI to hosted Growthub."));
    }
    console.log(pc.dim("Local workspace profile continues to work without authentication."));
    return;
  }

  console.log(pc.bold(`Signed in${payload.email ? ` as ${payload.email}` : payload.userId ? ` as ${payload.userId}` : ""}.`));
  if (payload.hostedBaseUrl) console.log(pc.dim(`Hosted: ${payload.hostedBaseUrl}`));
  if (payload.orgName || payload.orgId) {
    console.log(pc.dim(`Org: ${payload.orgName ?? payload.orgId}`));
  }
  if (payload.linkedInstanceId) {
    console.log(pc.dim(`Linked local instance: ${payload.linkedInstanceId}`));
  }
  if (payload.entitlements.length > 0) {
    console.log(pc.dim(`Entitlements: ${payload.entitlements.join(", ")}`));
  }
  if (payload.session.expiresAt) {
    console.log(pc.dim(`Session expires: ${payload.session.expiresAt}`));
  }
}
