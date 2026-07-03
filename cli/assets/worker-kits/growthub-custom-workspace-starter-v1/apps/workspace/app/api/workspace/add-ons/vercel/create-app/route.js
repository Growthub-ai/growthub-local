/**
 * GET /api/workspace/add-ons/vercel/create-app
 *
 * Preflight for the guided "Create Production App" flow: server-side connect
 * status for both accounts (GitHub + Vercel) and the pure checklist shape the
 * stepper renders. Read-only — no mutation, no receipts, no secrets in the
 * response (login + env ref NAMES only).
 */

import { NextResponse } from "next/server";
import {
  deriveCreateAppChecklist,
  resolveGithubAccountAuth,
  resolveGithubApiBaseUrl,
} from "@/lib/workspace-add-on-create-app";
import { resolveVercelAccountAuth } from "@/lib/workspace-add-on-deployments";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const PROBE_TIMEOUT_MS = 8000;

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

async function GET(request) {
  const auth = requireWorkspaceOperator(request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const githubAuth = resolveGithubAccountAuth(process.env);
  let github = { connected: false, login: "", missingEnv: githubAuth.missingEnv };
  if (githubAuth.ready) {
    try {
      const response = await fetchWithTimeout(`${resolveGithubApiBaseUrl(process.env)}/user`, {
        headers: { authorization: githubAuth.header, accept: "application/vnd.github+json" },
      });
      const payload = await response.json().catch(() => null);
      github = { connected: response.ok, login: response.ok ? String(payload?.login || "") : "", missingEnv: [] };
    } catch {
      github = { connected: false, login: "", missingEnv: [] };
    }
  }

  const vercelAuth = resolveVercelAccountAuth(process.env);
  const vercel = { connected: vercelAuth.ready, missingEnv: vercelAuth.missingEnv, teamId: vercelAuth.teamId };

  return NextResponse.json({
    ok: true,
    github,
    vercel,
    checklist: deriveCreateAppChecklist({ github, vercel }),
  });
}

export { GET };
