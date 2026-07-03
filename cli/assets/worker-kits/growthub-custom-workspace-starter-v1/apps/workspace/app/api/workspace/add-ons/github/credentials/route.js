/**
 * GitHub account credential lane for the guided create-app flow.
 *
 *   GET  — server-side connect status (login only; the token never leaves env)
 *   POST — verify a pasted token against GET /user, then persist ONLY the
 *          GITHUB_TOKEN env ref (same writeLocalEnv pattern as the provider
 *          credentials route) and emit an outcome receipt.
 *
 * No workspace-config write happens here — this route stores a runtime env
 * ref, exactly like the Vercel bearer credentials lane.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  GITHUB_TOKEN_ENV,
  actionableGithubError,
  resolveGithubAccountAuth,
  resolveGithubApiBaseUrl,
} from "@/lib/workspace-add-on-create-app";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const PROBE_TIMEOUT_MS = 8000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function probeGithubUser(header) {
  const response = await fetchWithTimeout(`${resolveGithubApiBaseUrl(process.env)}/user`, {
    headers: { authorization: header, accept: "application/vnd.github+json" },
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) return { ok: false, status: response.status, payload };
  return { ok: true, status: response.status, login: clean(payload?.login) };
}

function quoteEnv(value) {
  return JSON.stringify(String(value || ""));
}

async function writeLocalEnv(updates) {
  const envPath = path.join(process.cwd(), ".env.local");
  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const keys = Object.keys(updates).filter((key) => updates[key] && process.env[key] !== updates[key]);
  if (!keys.length) return [];
  const seen = new Set();
  const lines = raw.split(/\n/).map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match || !keys.includes(match[1])) return line;
    seen.add(match[1]);
    return `${match[1]}=${quoteEnv(updates[match[1]])}`;
  });
  for (const key of keys) {
    if (!seen.has(key)) lines.push(`${key}=${quoteEnv(updates[key])}`);
    process.env[key] = updates[key];
  }
  await fs.writeFile(envPath, `${lines.filter((line, index) => index < lines.length - 1 || line.trim()).join("\n")}\n`, "utf8");
  return keys;
}

async function GET(request) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const account = resolveGithubAccountAuth(process.env);
  if (!account.ready) {
    return NextResponse.json({ ok: true, connected: false, login: "", missingEnv: account.missingEnv });
  }
  const probe = await probeGithubUser(account.header);
  return NextResponse.json({
    ok: true,
    connected: probe.ok,
    login: probe.ok ? probe.login : "",
    missingEnv: [],
    ...(probe.ok ? {} : { error: actionableGithubError(probe.status, probe.payload) }),
  });
}

async function POST(request) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid json body", 400);
  }
  const token = clean(body?.credentials?.token ?? body?.token);
  if (!token) return jsonError("GitHub token is required", 400, { missingFields: ["token"] });

  const probe = await probeGithubUser(`Bearer ${token}`);
  if (!probe.ok) {
    return jsonError(actionableGithubError(probe.status, probe.payload), 422, { checked: { path: "/user", status: probe.status } });
  }

  await writeLocalEnv({ [GITHUB_TOKEN_ENV]: token });
  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-github-credentials",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "api-registry", objectType: "api-registry", rowName: "GitHub" }],
    changedFields: ["env.GITHUB_TOKEN"],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: `GitHub account verified as @${probe.login} and stored as a local runtime env ref.`,
    nextActions: ["Continue the guided create-app flow: create the private repository."],
  });

  return NextResponse.json({
    ok: true,
    connected: true,
    login: probe.login,
    resolvedEnv: [GITHUB_TOKEN_ENV],
    receiptId: receipt.receiptId,
  });
}

export { GET, POST };
