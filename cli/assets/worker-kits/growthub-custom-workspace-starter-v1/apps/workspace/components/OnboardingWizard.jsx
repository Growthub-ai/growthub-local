"use client";

import { useState } from "react";

const STEPS = [
  { id: "name", title: "Name your workspace" },
  { id: "dashboard", title: "Pick a starting dashboard" },
  { id: "widget", title: "Add your first widget" },
  { id: "integration", title: "Choose an integration mode" },
  { id: "deploy", title: "Review deploy checklist" }
];

const INTEGRATION_MODES = [
  { id: "static", label: "Static starter", description: "Local catalog only. No hosted authority required." },
  { id: "byo-api-key", label: "Bring your own key", description: "Workspace-owned connection metadata via env vars." },
  { id: "growthub-bridge", label: "Growthub Bridge", description: "Hosted Growthub account authority. Recommended." }
];

function OnboardingWizard({ initialState, widgetTypes, onSkip, onComplete, onAddWidget }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState({
    workspaceName: "",
    dashboardName: "Untitled",
    firstWidgetKind: "chart",
    integrationMode: "static",
    ...(initialState || {})
  });

  const step = STEPS[stepIndex];

  function next() {
    if (stepIndex >= STEPS.length - 1) {
      onComplete({ ...state, currentStep: "deploy", completedAt: new Date().toISOString() });
      return;
    }
    setStepIndex((prev) => prev + 1);
  }

  function back() {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }

  return (
    <div className="workspace-wizard-overlay" role="dialog" aria-modal="true">
      <div className="workspace-wizard">
        <header>
          <strong>{step.title}</strong>
          <button type="button" onClick={onSkip} aria-label="Skip onboarding">Skip</button>
        </header>
        <ol className="workspace-wizard-steps">
          {STEPS.map((item, index) => (
            <li key={item.id} className={index === stepIndex ? "active" : index < stepIndex ? "done" : ""}>
              {item.title}
            </li>
          ))}
        </ol>
        <div className="workspace-wizard-body">
          {step.id === "name" ? (
            <label>
              <span>Workspace name</span>
              <input
                type="text"
                value={state.workspaceName}
                onChange={(event) => setState({ ...state, workspaceName: event.target.value })}
                placeholder="Acme Workspace"
              />
            </label>
          ) : null}
          {step.id === "dashboard" ? (
            <label>
              <span>Dashboard name</span>
              <input
                type="text"
                value={state.dashboardName}
                onChange={(event) => setState({ ...state, dashboardName: event.target.value })}
              />
            </label>
          ) : null}
          {step.id === "widget" ? (
            <div className="workspace-wizard-options">
              {widgetTypes.map((widget) => (
                <button
                  key={widget.kind}
                  type="button"
                  className={state.firstWidgetKind === widget.kind ? "selected" : ""}
                  onClick={() => setState({ ...state, firstWidgetKind: widget.kind })}
                >
                  <span>{widget.icon}</span>
                  {widget.label}
                </button>
              ))}
              <p className="workspace-wizard-hint">
                Click "Next" to drop a {state.firstWidgetKind} widget on the canvas.
              </p>
            </div>
          ) : null}
          {step.id === "integration" ? (
            <div className="workspace-wizard-options vertical">
              {INTEGRATION_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={state.integrationMode === mode.id ? "selected" : ""}
                  onClick={() => setState({ ...state, integrationMode: mode.id })}
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.description}</span>
                </button>
              ))}
            </div>
          ) : null}
          {step.id === "deploy" ? (
            <div className="workspace-wizard-deploy">
              <p>
                Open the Deploy panel from the left rail to verify Bridge token, GitHub auth,
                fork registration, and bound agents. None of those run inside this UI.
              </p>
            </div>
          ) : null}
        </div>
        <footer>
          <button type="button" onClick={back} disabled={stepIndex === 0}>Back</button>
          <button
            type="button"
            onClick={() => {
              if (step.id === "widget") {
                onAddWidget(state.firstWidgetKind);
              }
              next();
            }}
          >
            {stepIndex >= STEPS.length - 1 ? "Finish" : "Next"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default OnboardingWizard;
