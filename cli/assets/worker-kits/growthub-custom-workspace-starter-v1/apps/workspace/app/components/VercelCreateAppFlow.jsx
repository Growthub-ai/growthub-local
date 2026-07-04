"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Github, Rocket } from "lucide-react";
import { deriveCreateAppChecklist } from "@/lib/workspace-add-on-create-app";

const DEFAULT_REPO_NAME = "growthub-workspace-app";

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
function VercelCreateAppFlow({ vercelConnected = false, vercelAccountLabel = "", onDeployProject, disabled = false }) {
  const [github, setGithub] = useState({ connected: false, login: "" });
  const [githubToken, setGithubToken] = useState("");
  const [repoName, setRepoName] = useState(DEFAULT_REPO_NAME);
  const [repoPrivate] = useState(true);
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
        const query = typeof window !== "undefined" ? window.location.search : "";
        const response = await fetch(`/api/workspace/add-ons/vercel/create-app${query}`, { method: "GET" });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) {
          setGithub(payload.github || { connected: false, login: "" });
          if (payload.repo) {
            setRepo(payload.repo);
            setRepoName(payload.repo.name || DEFAULT_REPO_NAME);
          }
          if (payload.project) setProject(payload.project);
          if (payload.deployment) setDeployment(payload.deployment);
          setPublished(Boolean(payload.published));
        }
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
    await connectGithubWith({ credentials: { token: githubToken } });
  }

  async function connectLocalGithub() {
    await connectGithubWith({ useLocalSession: true });
  }

  async function connectGithubWith(body) {
    setBusyStep("github-account");
    setErrorMessage("");
    try {
      const { ok, payload } = await postJson("/api/workspace/add-ons/github/credentials", body);
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
    if (!repoName.trim() || !vercelConnected || !github.connected || !repo) return;
    setErrorMessage("");

    // Step: Vercel project with the repo linked at creation (real 200 required)
    let projectResult = project;
    if (!projectResult) {
      setBusyStep("vercel-project");
      setStepMessage("Creating Vercel project linked to the repository…");
      const { ok, payload } = await postJson("/api/workspace/add-ons/vercel/create-app/project", {
        name: repoName,
        repoFullName: repo.fullName,
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

  async function createGithubRepo() {
    if (!repoName.trim() || !github.connected || repo) return;
    setBusyStep("github-repo");
    setStepMessage("Creating private GitHub repository and binding it to this workspace app...");
    setErrorMessage("");
    try {
      const { ok, payload } = await postJson("/api/workspace/add-ons/vercel/create-app/github-repo", { name: repoName });
      if (!ok) {
        setErrorMessage(payload?.error || "GitHub repository step failed.");
        return;
      }
      setRepo(payload.repo);
      setStepMessage("");
    } catch (error) {
      setErrorMessage(error?.message || "GitHub repository step failed.");
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
            <div className="dm-marketplace-error is-warning">
              No GitHub connection yet — connect this computer's authenticated GitHub session first.
            </div>
            <div className="dm-marketplace-install-choice">
              <div>
                <strong>Use this computer's GitHub session</strong>
                <span>Imports the active `gh` login into this temp workspace only. The browser never receives the token.</span>
              </div>
              <button type="button" className="dm-btn-outline" disabled={disabled || running} onClick={connectLocalGithub}>
                {busyStep === "github-account" ? "Checking..." : "Use local GitHub"}
              </button>
            </div>
            <div className="dm-marketplace-resource-divider" role="separator"><span>Or paste a token</span></div>
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
            <div className="dm-marketplace-credential-actions">
              <button type="button" className="dm-btn-primary-sm" disabled={disabled || running || !githubToken.trim()} onClick={connectGithub}>
                {busyStep === "github-account" ? "Verifying..." : "Verify token"}
              </button>
            </div>
          </>
        ) : (
          <div className="dm-marketplace-env is-ready">
            <span>GitHub connected</span>
            <code>@{github.login || "connected"}</code>
          </div>
        )}

        {!complete && !repo ? (
          <>
            <p className="dm-marketplace-section-title">GitHub Repository</p>
            <label className="dm-marketplace-field">
              <span>Repository name</span>
              <input
                type="text"
                value={repoName}
                onChange={(event) => setRepoName(event.target.value)}
                placeholder="new-repo-name"
                disabled={running || !github.connected}
              />
            </label>
            <label className="dm-marketplace-toggle">
                <input type="checkbox" checked={repoPrivate} readOnly />
                <span>Private</span>
            </label>
          </>
        ) : null}

        {repo ? (
          <div className="dm-marketplace-env is-ready">
            <span>GitHub repo</span>
            <code title={repo.fullName}>{repo.fullName}</code>
          </div>
        ) : null}

        <div className="dm-marketplace-provision-steps" aria-label="Create app progress">
          {checklist.steps.map((step) => (
            <div key={step.id} className={step.done ? "is-complete dm-marketplace-step-action-row" : busyStep === step.id ? "is-active dm-marketplace-step-action-row" : "dm-marketplace-step-action-row"}>
              <span className="dm-marketplace-step-label" title={step.label}>{step.label}</span>
              {step.done ? <CheckCircle2 className="dm-marketplace-step-check" size={14} aria-hidden /> : null}
            </div>
          ))}
        </div>

        {stepMessage ? <p className="dm-cockpit-step-hint">{stepMessage}</p> : null}
        {errorMessage ? <p className="dm-cockpit-step-hint" role="alert">{errorMessage}</p> : null}
        {repo && vercelConnected ? (
          <div className="dm-marketplace-env is-ready">
            <span>Vercel connected</span>
            <code title={vercelAccountLabel || "Provider account"}>{vercelAccountLabel || "Provider account"}</code>
          </div>
        ) : null}

        {repo && !vercelConnected ? <p className="dm-cockpit-step-hint">Repository is ready. Connect the Vercel provider account above to create the project and deploy.</p> : null}

        {repo && vercelConnected && !complete ? (
          <label className="dm-marketplace-field">
            <span>Vercel project name</span>
            <input
              type="text"
              value={repoName}
              onChange={(event) => setRepoName(event.target.value)}
              placeholder="production-project-name"
              disabled={running}
            />
          </label>
        ) : null}

        {complete ? (
          <div className="dm-marketplace-config-summary" aria-label="Production app live">
            <div><span>Production site</span><code title={deployment?.url || "deployed"}>{deployment?.url || "deployed"}</code></div>
            <div><span>GitHub repo</span><code title={repo?.fullName}>{repo?.fullName}</code></div>
            <div><span>Deployment</span><code title={`${deployment?.deploymentId || ""} · ${deployment?.readyState || ""}`}>{deployment?.deploymentId} · {deployment?.readyState}</code></div>
            <div><span>Governed record</span><code title={`vercel-projects · ${project?.name || ""}`}>vercel-projects · {project?.name}</code></div>
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
          !repo ? (
            <button
              type="button"
              className="dm-btn-primary-sm"
              disabled={disabled || running || !github.connected || !repoName.trim()}
              onClick={createGithubRepo}
            >
              {busyStep === "github-repo" ? "Creating..." : "+ Create & Bind"}
            </button>
          ) : (
            <button
              type="button"
              className="dm-btn-primary-sm"
              disabled={disabled || running || !vercelConnected || !repoName.trim()}
              onClick={createApp}
            >
              {running ? (stepMessage || "Working...") : "DEPLOY LIVE"}
            </button>
          )
        )}
      </footer>
    </section>
  );
}

export { VercelCreateAppFlow };
