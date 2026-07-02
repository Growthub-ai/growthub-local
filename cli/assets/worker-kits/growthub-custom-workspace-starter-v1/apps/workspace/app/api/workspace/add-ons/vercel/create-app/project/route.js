/**
 * POST /api/workspace/add-ons/vercel/create-app/project
 *
 * Step 5 of the guided create-app flow: create the Vercel project with the
 * GitHub repository linked AT CREATION TIME (POST /v11/projects with
 * gitRepository — requires the Vercel GitHub App; failures map to actionable
 * guidance).
 *
 * VALIDATION-GATE NOTE: this route writes NOTHING to workspace config — the
 * governed record is created only by the deploy route after the full chain
 * (repo 201 → project 200 → deployment 200) succeeds. Receipts record both
 * published and blocked outcomes so a failed chain is still auditable.
 */

import { NextResponse } from "next/server";
import {
  actionableVercelProjectError,
  buildVercelProjectCreateRequest,
} from "@/lib/workspace-add-on-create-app";
import {
  normalizeVercelProject,
  resolveVercelAccountAuth,
  resolveVercelApiBaseUrl,
} from "@/lib/workspace-add-on-deployments";
import { appendOutcomeReceipt } from "@/lib/workspace-outcome-receipts";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

const PROBE_TIMEOUT_MS = 15000;

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

async function blockedReceipt(rowName, summary, violationCode, nextAction) {
  await appendOutcomeReceipt({
    kind: "workspace-add-on-vercel-create-app",
    lane: "server-authoritative",
    outcomeStatus: "blocked",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "vercel-projects", objectType: "custom", rowName }],
    summary,
    policyVerdict: { ok: false, violationCodes: [violationCode] },
    nextActions: [nextAction],
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
  const name = clean(body.name);
  const repoFullName = clean(body.repoFullName);
  const framework = clean(body.framework) || null;
  if (!name || !repoFullName) {
    return jsonError("project name and repoFullName are required", 400, {
      missingFields: [!name ? "name" : "", !repoFullName ? "repoFullName" : ""].filter(Boolean),
    });
  }

  const account = resolveVercelAccountAuth(process.env);
  if (!account.ready) {
    await blockedReceipt(name, "Guided create-app blocked: Vercel credentials are not connected.", "provider_account_credentials_missing", "Connect the Vercel provider account, then retry the project step.");
    return jsonError("Vercel account auth is not connected", 422, { missingEnv: account.missingEnv });
  }

  const createRequest = buildVercelProjectCreateRequest({
    name,
    repoFullName,
    framework,
    baseUrl: resolveVercelApiBaseUrl(process.env),
    teamId: account.teamId,
  });
  if (!createRequest.ok) return jsonError(createRequest.reason, 400);

  let project = null;
  try {
    const response = await fetchWithTimeout(createRequest.url, {
      method: "POST",
      headers: { authorization: account.header, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(createRequest.body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const guidance = actionableVercelProjectError(response.status, payload);
      await blockedReceipt(name, `Guided create-app blocked: ${guidance}`, "vercel_project_create_failed", guidance);
      return jsonError(guidance, response.status === 409 ? 409 : 502, { step: "vercel-project" });
    }
    project = normalizeVercelProject(payload);
  } catch (error) {
    const guidance = `Vercel project creation failed: ${error?.message || "network error"}.`;
    await blockedReceipt(name, `Guided create-app blocked: ${guidance}`, "vercel_project_create_failed", guidance);
    return jsonError(guidance, 502, { step: "vercel-project" });
  }
  if (!project) {
    await blockedReceipt(name, "Guided create-app blocked: Vercel returned an unrecognized project payload.", "vercel_project_create_failed", "Retry the project step; if it persists, create the project on Vercel and use Link Existing instead.");
    return jsonError("Vercel returned an unrecognized project payload", 502, { step: "vercel-project" });
  }

  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-vercel-create-app",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: "vercel-projects", objectType: "custom", rowName: project.name }],
    changedFields: ["external.vercel-project"],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: `Vercel project ${project.name} created with ${repoFullName} linked at creation.`,
    nextActions: ["Continue the guided flow: run the initial deployment — on success it publishes the governed Data Model record atomically."],
  });

  return NextResponse.json({
    ok: true,
    step: "vercel-project",
    project,
    receiptId: receipt.receiptId,
  });
}

export { POST };
