import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import os from "node:os";
import { URL } from "node:url";

/**
 * Browser-driven hosted login flow for the CLI.
 *
 * Mirrors the `GrowthubConnectionCard` server flow (`/auth/callback?token=...`)
 * but the callback listener is owned by the CLI (ephemeral local HTTP server)
 * so authentication works without a running Growthub local server.
 *
 * Flow:
 *   1. CLI generates a random `state`.
 *   2. CLI binds an ephemeral loopback HTTP listener (127.0.0.1:<random-port>).
 *   3. CLI opens `${hostedBaseUrl}/cli/login?state=...&callback=http://127.0.0.1:<port>/cli-callback`.
 *   4. Hosted app authenticates the user, exchanges Supabase session for a
 *      short-lived bearer token, redirects to the CLI callback with
 *      `token`, `state`, and optional profile metadata.
 *   5. CLI validates `state`, captures token + metadata, closes the listener.
 *
 * For CI / headless environments, the caller can bypass the browser flow by
 * providing a token directly via `growthub auth login --token ...`.
 */
const DEFAULT_HOSTED_LOGIN_PATH = "/cli/login";
const CALLBACK_PATH = "/cli-callback";

export interface LoginFlowResult {
  state: string;
  token: string;
  hostedBaseUrl: string;
  expiresAt?: string;
  userId?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  machineLabel?: string;
}

export interface StartLoginFlowOptions {
  hostedBaseUrl: string;
  timeoutMs?: number;
  machineLabel?: string;
  workspaceLabel?: string;
  hostedLoginPath?: string;
}

export interface LoginFlowContext {
  state: string;
  callbackUrl: string;
  loginUrl: string;
  waitForCallback: () => Promise<LoginFlowResult>;
  close: () => void;
}

function randomState(): string {
  return randomBytes(16).toString("hex");
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function pickParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function renderSuccessPage(hostedBaseUrl: string): string {
  const safeBase = hostedBaseUrl.replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Growthub CLI connected</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #0b0f14; color: #f5f7fa; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { width: min(560px, 100%); background: #121821; border: 1px solid #263244; border-radius: 16px; padding: 24px; box-sizing: border-box; }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { margin: 0 0 12px; line-height: 1.5; color: #c7d2e0; }
      a { color: #7dd3fc; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Growthub CLI connected</h1>
        <p>Your local CLI now has a hosted session token. You can close this tab and return to your terminal.</p>
        <p>Hosted app: <a href="${safeBase}">${safeBase}</a></p>
      </section>
    </main>
    <script>window.setTimeout(() => { try { window.close(); } catch {} }, 1200);</script>
  </body>
</html>`;
}

function renderErrorPage(message: string): string {
  const safeMessage = message.replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Growthub CLI login error</title></head>
<body style="font-family: ui-sans-serif, system-ui, sans-serif; background: #0b0f14; color: #f5f7fa; padding: 24px;">
  <h1>Login error</h1>
  <p>${safeMessage}</p>
  <p>Return to your terminal and try again.</p>
</body></html>`;
}

function listenOnEphemeralLoopback(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind loopback port for CLI auth callback."));
        return;
      }
      resolve(address.port);
    });
  });
}

export async function startLoginFlow(opts: StartLoginFlowOptions): Promise<LoginFlowContext> {
  const hostedBaseUrl = trimSlashes(opts.hostedBaseUrl);
  if (!hostedBaseUrl) {
    throw new Error("hostedBaseUrl is required to start the CLI login flow.");
  }
  try {
    // validate
    new URL(hostedBaseUrl);
  } catch {
    throw new Error(`Invalid hosted base URL: ${opts.hostedBaseUrl}`);
  }

  const state = randomState();
  const machineLabel = opts.machineLabel?.trim() || os.hostname();
  const workspaceLabel = opts.workspaceLabel?.trim();
  const timeoutMs = Math.max(30_000, opts.timeoutMs ?? 5 * 60_000);

  let resolver: ((result: LoginFlowResult) => void) | null = null;
  let rejecter: ((err: Error) => void) | null = null;

  const waitPromise = new Promise<LoginFlowResult>((resolve, reject) => {
    resolver = resolve;
    rejecter = reject;
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    try {
      const host = req.headers.host ?? "127.0.0.1";
      const requestUrl = new URL(req.url ?? "/", `http://${host}`);

      if (requestUrl.pathname !== CALLBACK_PATH) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      const incomingState = pickParam(requestUrl, "state");
      if (!incomingState || incomingState !== state) {
        res.statusCode = 400;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(renderErrorPage("State token mismatch. Restart `growthub auth login`."));
        rejecter?.(new Error("CLI auth callback rejected — state mismatch."));
        return;
      }

      const error = pickParam(requestUrl, "error");
      if (error) {
        res.statusCode = 400;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(renderErrorPage(error));
        rejecter?.(new Error(`Hosted app reported login error: ${error}`));
        return;
      }

      const token = pickParam(requestUrl, "token");
      if (!token) {
        res.statusCode = 400;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(renderErrorPage("Missing token in callback."));
        rejecter?.(new Error("CLI auth callback missing token."));
        return;
      }

      const result: LoginFlowResult = {
        state,
        token,
        hostedBaseUrl,
        expiresAt: pickParam(requestUrl, "expiresAt"),
        userId: pickParam(requestUrl, "userId"),
        email: pickParam(requestUrl, "email"),
        orgId: pickParam(requestUrl, "orgId"),
        orgName: pickParam(requestUrl, "orgName"),
        machineLabel: pickParam(requestUrl, "machineLabel") ?? machineLabel,
      };

      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(renderSuccessPage(hostedBaseUrl));

      resolver?.(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 500;
      res.end(message);
      rejecter?.(err instanceof Error ? err : new Error(message));
    }
  });

  const port = await listenOnEphemeralLoopback(server);
  const callbackUrl = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

  const hostedLoginPath = opts.hostedLoginPath ?? DEFAULT_HOSTED_LOGIN_PATH;
  const loginUrl = (() => {
    const url = new URL(hostedLoginPath, `${hostedBaseUrl}/`);
    url.searchParams.set("state", state);
    url.searchParams.set("callback", callbackUrl);
    url.searchParams.set("machineLabel", machineLabel);
    if (workspaceLabel) url.searchParams.set("workspaceLabel", workspaceLabel);
    url.searchParams.set("source", "cli");
    return url.toString();
  })();

  let timeoutHandle: NodeJS.Timeout | null = setTimeout(() => {
    rejecter?.(new Error(`CLI login timed out after ${Math.round(timeoutMs / 1000)}s.`));
  }, timeoutMs);
  if (typeof timeoutHandle.unref === "function") timeoutHandle.unref();

  const close = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    server.close();
  };

  const waitForCallback = async () => {
    try {
      const result = await waitPromise;
      return result;
    } finally {
      close();
    }
  };

  return {
    state,
    callbackUrl,
    loginUrl,
    waitForCallback,
    close,
  };
}
