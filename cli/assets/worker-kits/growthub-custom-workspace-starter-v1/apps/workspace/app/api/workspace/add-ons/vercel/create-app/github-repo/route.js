/**
 * POST /api/workspace/add-ons/vercel/create-app/github-repo
 *
 * Step 3 of the guided create-app flow: create the PRIVATE GitHub repository
 * and seed the starter page. Atomic-success contract: the step returns ok only
 * when the repo create AND the starter seed both return real 2xx responses.
 *
 * Data Model contract: the GitHub repo step creates/updates the same
 * `vercel-projects` governed row that the later Vercel project + deployment
 * steps complete. The row stores only non-secret repo/project/deploy metadata.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, writeWorkspaceConfig } from "@/lib/workspace-config";
import {
  actionableGithubError,
  buildGithubRepoCreateRequest,
  buildGithubSeedRequest,
  normalizeGithubRepo,
  resolveGithubAccountAuth,
  resolveGithubApiBaseUrl,
  starterAppFiles,
} from "@/lib/workspace-add-on-create-app";
import { VERCEL_PROJECTS_OBJECT_ID, withVercelProjectsDirectory } from "@/lib/workspace-add-ons";
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

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
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
  const org = clean(body.org);
  if (!name) return jsonError("repository name is required", 400, { missingFields: ["name"] });

  const account = resolveGithubAccountAuth(process.env);
  if (!account.ready) {
    await blockedReceipt(name, "Guided create-app blocked: GitHub credentials are not connected.", "github_credentials_missing", "Connect GitHub from the guided flow, then retry the repository step.");
    return jsonError("GitHub account is not connected", 422, { missingEnv: account.missingEnv });
  }

  const githubBaseUrl = resolveGithubApiBaseUrl(process.env);
  const createRequest = buildGithubRepoCreateRequest({ name, org, baseUrl: githubBaseUrl });
  if (!createRequest.ok) return jsonError(createRequest.reason, 400);

  let repo = null;
  try {
    const response = await fetchWithTimeout(createRequest.url, {
      method: "POST",
      headers: { authorization: account.header, accept: "application/vnd.github+json", "content-type": "application/json" },
      body: JSON.stringify(createRequest.body),
    });
    const payload = await readJsonSafe(response);
    if (!response.ok) {
      const guidance = actionableGithubError(response.status, payload);
      await blockedReceipt(name, `Guided create-app blocked: ${guidance}`, "github_repo_create_failed", guidance);
      return jsonError(guidance, response.status === 422 ? 409 : 502, { step: "github-repo" });
    }
    repo = normalizeGithubRepo(payload);
  } catch (error) {
    const guidance = `GitHub repository creation failed: ${error?.message || "network error"}.`;
    await blockedReceipt(name, `Guided create-app blocked: ${guidance}`, "github_repo_create_failed", guidance);
    return jsonError(guidance, 502, { step: "github-repo" });
  }
  if (!repo) {
    await blockedReceipt(name, "Guided create-app blocked: GitHub returned an unrecognized repository payload.", "github_repo_create_failed", "Retry the repository step; if it persists, create the repo on GitHub and use Link Existing instead.");
    return jsonError("GitHub returned an unrecognized repository payload", 502, { step: "github-repo" });
  }

  // Seed the starter page — required so the initial deployment serves a real
  // page. Atomic step contract: seed failure fails the whole step.
  for (const file of starterAppFiles({ appName: repo.name })) {
    const seedRequest = buildGithubSeedRequest({ repoFullName: repo.fullName, file, branch: repo.defaultBranch, baseUrl: githubBaseUrl });
    if (!seedRequest.ok) return jsonError(seedRequest.reason, 500, { step: "github-seed" });
    try {
      const response = await fetchWithTimeout(seedRequest.url, {
        method: "PUT",
        headers: { authorization: account.header, accept: "application/vnd.github+json", "content-type": "application/json" },
        body: JSON.stringify(seedRequest.body),
      });
      if (!response.ok) {
        const payload = await readJsonSafe(response);
        const guidance = actionableGithubError(response.status, payload);
        await blockedReceipt(repo.fullName, `Guided create-app blocked while seeding the starter: ${guidance}`, "github_seed_failed", guidance);
        return jsonError(guidance, 502, { step: "github-seed", repo });
      }
    } catch (error) {
      const guidance = `Starter seed failed: ${error?.message || "network error"}.`;
      await blockedReceipt(repo.fullName, `Guided create-app blocked: ${guidance}`, "github_seed_failed", guidance);
      return jsonError(guidance, 502, { step: "github-seed", repo });
    }
  }

  const now = new Date().toISOString();
  const currentConfig = await readWorkspaceConfig();
  const withRepoRow = withVercelProjectsDirectory(currentConfig, {
    linkedAt: now,
    projects: [{
      name: repo.name,
      gitProvider: "github",
      gitRepo: repo.fullName,
      gitRepoId: repo.id,
      gitBranch: repo.defaultBranch,
      gitRepoUrl: repo.htmlUrl,
    }],
  });
  await writeWorkspaceConfig({ dataModel: withRepoRow.dataModel });

  const { receipt } = await appendOutcomeReceipt({
    kind: "workspace-add-on-vercel-create-app",
    lane: "server-authoritative",
    outcomeStatus: "published",
    actor: "workspace-marketplace",
    objectRefs: [{ objectId: VERCEL_PROJECTS_OBJECT_ID, objectType: "custom", rowName: repo.fullName }],
    changedFields: [`dataModel.${VERCEL_PROJECTS_OBJECT_ID}.${repo.fullName}.gitRepo`],
    policyVerdict: { ok: true },
    schemaVerdict: { ok: true },
    summary: `Private GitHub repository ${repo.fullName} created and seeded with the starter page.`,
    nextActions: ["Continue the guided flow: create the Vercel project linked to this repository."],
  });

  return NextResponse.json({
    ok: true,
    step: "github-repo",
    repo,
    receiptId: receipt.receiptId,
  });
}

export { POST };
