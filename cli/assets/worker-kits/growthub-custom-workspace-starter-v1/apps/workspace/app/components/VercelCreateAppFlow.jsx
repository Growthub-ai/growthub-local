"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Github, Rocket } from "lucide-react";
import { deriveCreateAppChecklist } from "@/lib/workspace-add-on-create-app";

/**
 * Guided "Create Production App" flow — GitHub private repo → starter seed →
 * Vercel project (repo linked at creation) → initial deploy → governed record.
 *
 * Thin trigger layer over the governed routes (reuses the marketplace card
 * CSS; no new chrome). Each step turns green ONLY on a real 2xx from its
 * server route; the checklist is derived by the same pure helper the tests
 * pin, so progress can never be optimistic. The one workspace-config write in
 * the chain is the existing governed deploy route (the atomic publish gate),
 * invoked through the add-ons-client handler so config state stays
 * authoritative.
 */
function VercelCreateAppFlow({ vercelConnected = false, onDeployProject, disabled = false }) {
  const [github, setGithub] = useState({ connected: false, login: "" });
  const [githubToken, setGithubToken] = useState("");
  const [repoName, setRepoName] = useState("");
  const [repoOrg, setRepoOrg] = useState("");
  const [repo, setRepo] = useState(null);
  const [project, setProject] = useState(null);
  const [deployment, setDeployment] = useState(null);
  const [published, setPublished] = useState(false);
  const [busyStep, setBusyStep] = useState("");
  const [stepMessage, setStepMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const checklist = deriveCreateAppChecklist({
    github,
    repo,
    vercel: { connected: vercelConnected },
    project,
    deployment,
    published,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/workspace/add-ons/vercel/create-app", { method: "GET" });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setGithub(payload.github || { connected: false, login: "" });
      } catch {
        /* preflight is best-effort; the connect form stays available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, payload };
  }

  async function connectGithub() {
    if (!githubToken.trim()) return;
    setBusyStep("github-account");
    setErrorMessage("");
    try {
      const { ok, payload } = await postJson("/api/workspace/add-ons/github/credentials", { credentials: { token: githubToken } });
      if (!ok) {
        setErrorMessage(payload?.error || "GitHub token could not be verified.");
        return;
      }
      setGithub({ connected: true, login: payload.login || "" });
      setGithubToken("");
    } catch (error) {
      setErrorMessage(error?.message || "GitHub connect failed.");
    } finally {
      setBusyStep("");
    }
  }

  async function createApp() {
    if (!repoName.trim() || !vercelConnected || !github.connected) return;
    setErrorMessage("");

    // Step: private repo + starter seed (real 2xx required)
    let repoResult = repo;
    if (!repoResult) {
      setBusyStep("github-repo");
      setStepMessage("Creating private GitHub repository and seeding the starter…");
      const { ok, payload } = await postJson("/api/workspace/add-ons/vercel/create-app/github-repo", { name: repoName, org: repoOrg });
      if (!ok) {
        setBusyStep("");
        setErrorMessage(payload?.error || "GitHub repository step failed.");
        return;
      }
      repoResult = payload.repo;
      setRepo(repoResult);
    }

    // Step: Vercel project with the repo linked at creation (real 200 required)
    let projectResult = project;
    if (!projectResult) {
      setBusyStep("vercel-project");
      setStepMessage("Creating Vercel project linked to the repository…");
      const { ok, payload } = await postJson("/api/workspace/add-ons/vercel/create-app/project", {
        name: repoName,
        repoFullName: repoResult.fullName,
      });
      if (!ok) {
        setBusyStep("");
        setErrorMessage(payload?.error || "Vercel project step failed.");
        return;
      }
      projectResult = payload.project;
      setProject(projectResult);
    }

    // Step: initial deploy — the governed ATOMIC PUBLISH gate. Only this call
    // persists anything; it writes the vercel-projects record with proof.
    setBusyStep("initial-deploy");
    setStepMessage("Deploying starter and validating the live deployment…");
    const deployPayload = await onDeployProject?.({ projectId: projectResult.id });
    if (!deployPayload || deployPayload.error) {
      setBusyStep("");
      setErrorMessage(deployPayload?.error || "Initial deployment failed — check the Vercel dashboard logs, then retry.");
      return;
    }
    setDeployment(deployPayload.deployment || null);

    // Step: publish & validate — confirm the governed record exists server-side.
    setBusyStep("publish");
    setStepMessage("Validating the governed workspace record…");
    try {
      const response = await fetch("/api/workspace/add-ons/vercel/projects", { method: "GET" });
      const payload = await response.json().catch(() => ({}));
      const linked = Array.isArray(payload.projects)
        ? payload.projects.find((item) => item.id === projectResult.id)
        : null;
      setPublished(Boolean(linked?.linked));
      setStepMessage(linked?.linked ? "" : "Deployment succeeded but the governed record was not visible yet — reopen the Data Model to confirm.");
    } catch {
      setPublished(false);
      setStepMessage("Deployment succeeded but validation could not re-read the workspace — reopen the Data Model to confirm.");
    } finally {
      setBusyStep("");
    }
  }

  const running = Boolean(busyStep);
  const complete = checklist.complete;

  return (
    <section className="dm-marketplace-install-card" aria-label="Create Production App">
      <div className="dm-marketplace-product-head">
        <span className="dm-marketplace-product-icon is-provider"><Rocket size={18} /></span>
        <div>
          <h3>Create Production App</h3>
          <p>Private GitHub repo → Vercel project → live deployment → governed Data Model record. Nothing is saved to the workspace until every step returns a real success.</p>
        </div>
        <span className={complete ? "dm-db-status ok" : "dm-db-status"}><span />{complete ? "Live" : "Guided setup"}</span>
      </div>

      <div className="dm-marketplace-config">
        {!github.connected ? (
          <>
            <p className="dm-marketplace-section-title"><Github size={14} /> GitHub Account</p>
            <div className="dm-marketplace-credential-grid">
              <label className="dm-marketplace-field">
                <span>GitHub access token (repo scope)</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={githubToken}
                  onChange={(event) => setGithubToken(event.target.value)}
                  placeholder="ghp_… or github_pat_…"
                />
              </label>
            </div>
            <div className="dm-marketplace-step-action-row">
              <span>Verify and connect</span>
              <button type="button" className="dm-btn-primary-sm" disabled={disabled || running || !githubToken.trim()} onClick={connectGithub}>
                {busyStep === "github-account" ? "Verifying…" : "Connect GitHub"}
              </button>
            </div>
          </>
        ) : (
          <div className="dm-marketplace-env is-ready">
            <span>GitHub connected</span>
            <code>@{github.login || "connected"}</code>
          </div>
        )}

        {!complete ? (
          <>
            <label className="dm-marketplace-field">
              <span>App / repository name (repo is created Private)</span>
              <input
                type="text"
                value={repoName}
                onChange={(event) => setRepoName(event.target.value)}
                placeholder="my-production-app"
                disabled={running || Boolean(repo)}
              />
            </label>
            <label className="dm-marketplace-field">
              <span>GitHub org (optional — defaults to your account)</span>
              <input
                type="text"
                value={repoOrg}
                onChange={(event) => setRepoOrg(event.target.value)}
                placeholder="acme-inc"
                disabled={running || Boolean(repo)}
              />
            </label>
          </>
        ) : null}

        <div className="dm-marketplace-provision-steps" aria-label="Create app progress">
          {checklist.steps.map((step) => (
            <div key={step.id} className={step.done ? "is-complete dm-marketplace-step-action-row" : busyStep === step.id ? "is-active dm-marketplace-step-action-row" : "dm-marketplace-step-action-row"}>
              <span>{step.label}</span>
              {step.done ? <CheckCircle2 size={14} aria-hidden /> : null}
            </div>
          ))}
        </div>

        {stepMessage ? <p className="dm-cockpit-step-hint">{stepMessage}</p> : null}
        {errorMessage ? <p className="dm-cockpit-step-hint" role="alert">{errorMessage}</p> : null}
        {!vercelConnected ? <p className="dm-cockpit-step-hint">Connect the Vercel provider account above first — the guided flow unlocks when both accounts are verified.</p> : null}

        {complete ? (
          <div className="dm-marketplace-config-summary" aria-label="Production app live">
            <div><span>Production site</span><code>{deployment?.url || "deployed"}</code></div>
            <div><span>GitHub repo</span><code>{repo?.fullName}</code></div>
            <div><span>Deployment</span><code>{deployment?.deploymentId} · {deployment?.readyState}</code></div>
            <div><span>Governed record</span><code>vercel-projects · {project?.name}</code></div>
          </div>
        ) : null}
      </div>

      <footer className="dm-marketplace-actions">
        {complete ? (
          <>
            {deployment?.url ? (
              <a className="dm-btn-primary-sm" href={deployment.url} target="_blank" rel="noreferrer">
                Visit Production Site <ExternalLink size={13} aria-hidden />
              </a>
            ) : null}
            {repo?.htmlUrl ? (
              <a className="dm-btn-outline" href={repo.htmlUrl} target="_blank" rel="noreferrer">
                Open repo <ExternalLink size={12} aria-hidden />
              </a>
            ) : null}
            <a className="dm-btn-outline" href="/data-model">Open governed record</a>
          </>
        ) : (
          <button
            type="button"
            className="dm-btn-primary-sm"
            disabled={disabled || running || !vercelConnected || !github.connected || !repoName.trim()}
            onClick={createApp}
          >
            {running ? (stepMessage || "Working…") : repo || project ? "Resume setup" : (<><Rocket size={13} aria-hidden /> Create & Deploy</>)}
          </button>
        )}
      </footer>
    </section>
  );
}

export { VercelCreateAppFlow };
