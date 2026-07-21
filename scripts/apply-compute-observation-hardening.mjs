#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[observe-hardening] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[observe-hardening] ambiguous anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceOrSkip(source, before, after, marker, label) {
  if (source.includes(before)) return replaceOnce(source, before, after, label);
  if (source.includes(marker)) return source;
  throw new Error(`[observe-hardening] neither old nor hardened form found: ${label}`);
}

const routePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-run/route.js";
let route = read(routePath);
route = replaceOrSkip(
  route,
  `        action: ["run", "cancel", "resume"].includes(String(body?.computeAction || "run")) ? String(body?.computeAction || "run") : "run",`,
  `        // "observe" is a governed continuation of the same durable run — it
        // never creates a new mutation lane or a new training identity.
        action: ["run", "observe", "cancel", "resume"].includes(String(body?.computeAction || "run")) ? String(body?.computeAction || "run") : "run",`,
  `["run", "observe", "cancel", "resume"]`,
  "sandbox-run observe action",
);
write(routePath, route);

const modalPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/components/TrainingHandoffModal.jsx";
let modal = read(modalPath);
modal = replaceOrSkip(
  modal,
  `    let sawStamp = false;
    pollRef.current = setInterval(async () => {`,
  `    let sawStamp = false;
    // Remote provider observation is a governed continuation, not one
    // hour-long HTTP request. At most one continuation is in flight and the
    // cadence is bounded independently of the five-second receipt refresh.
    let observeInFlight = false;
    let lastObserveAt = 0;
    pollRef.current = setInterval(async () => {`,
  `let observeInFlight = false;`,
  "observation latches",
);
modal = replaceOrSkip(
  modal,
  `        const remoteCompute = parseReceiptComputeBlock(rawRow);
        if (String(rawRow?.progress?.stageId || "").trim() || rawRow?.preflight || remoteCompute?.decision || remoteCompute?.events?.length || ["trained", "imported", "failed"].includes(myStage)) sawStamp = true;

        if (myStage === "failed") {`,
  `        const remoteCompute = parseReceiptComputeBlock(rawRow);
        if (String(rawRow?.progress?.stageId || "").trim() || rawRow?.preflight || remoteCompute?.decision || remoteCompute?.events?.length || ["trained", "imported", "failed"].includes(myStage)) sawStamp = true;

        // The executor intentionally observes only a few provider states per
        // request. Continue the SAME run through sandbox-run while a remote
        // allocation is active; the server reconciles by sealed authority +
        // idempotency identity, so this can observe but cannot duplicate spend.
        const remoteEvents = Array.isArray(remoteCompute?.events) ? remoteCompute.events : [];
        const remoteTerminal = remoteEvents.some((event) => ["compute-completed", "compute-failed", "compute-cancelled"].includes(String(event?.type || "")));
        const remoteSelected = String(remoteCompute?.decision?.selectedProviderId || remoteCompute?.providerRegistryId || "");
        const remoteNeedsObservation = Boolean(remoteCompute?.allocation && remoteSelected && remoteSelected !== "local-machine" && !remoteTerminal);
        const observeNow = Date.now();
        if (remoteNeedsObservation && !observeInFlight && observeNow - lastObserveAt >= 10_000) {
          observeInFlight = true;
          lastObserveAt = observeNow;
          void fetch("/api/workspace/sandbox-run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              objectId: TRAINING_RUNNER_SANDBOX_ID,
              name: activeId,
              computeAction: "observe",
              intent: "model-training-observe",
              actor: "training-runtime-modal",
            }),
          }).then(async (response) => {
            // A non-2xx response is actionable; a provider-state uncertainty
            // remains receipt-visible and retryable without demoting the run.
            if (!response.ok) {
              const detail = (await response.text()).slice(0, 240);
              setError(`Remote observation failed: ${detail || response.status}`);
            }
          }).catch((observationError) => {
            setError(`Remote observation failed: ${observationError instanceof Error ? observationError.message : String(observationError)}`);
          }).finally(() => { observeInFlight = false; });
        }

        if (myStage === "failed") {`,
  `computeAction: "observe"`,
  "remote observation continuation",
);
write(modalPath, modal);

console.log("[observe-hardening] sandbox-run and TrainingHandoffModal now continue remote observation through the governed run authority");
