#!/usr/bin/env node
/**
 * End-to-end gallery probe: exported starter + production next start on 3801/3803.
 * Covers validator negative/positive paths and crm-settings mirror contract.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP_DIR =
  process.env.GH_GALLERY_APP_DIR ||
  "/tmp/gh-template-gallery-test/growthub-custom-workspace-starter-v1/apps/workspace";
const FS_PORT = Number(process.env.GH_FS_PORT || 3801);
const RO_PORT = Number(process.env.GH_RO_PORT || 3803);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function waitFor(url, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok || res.status === 409) return res;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error(`timeout: ${url}`);
}

function startServer(port, envExtra) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    ...envExtra,
  };
  const child = spawn("pnpm", ["exec", "next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: APP_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

function buildCrmSettingsPatch() {
  return {
    objects: [
      {
        id: "crm-settings",
        label: "CRM Settings Mirror",
        source: "CRM Settings Mirror",
        objectType: "crm-settings",
        icon: "SlidersHorizontal",
        pickerHidden: true,
        columns: ["id", "updatedAt", "userShowFoldersNav", "agentEnableCrmTrace"],
        rows: [
          {
            id: "mirror",
            updatedAt: new Date().toISOString(),
            updatedBy: "e2e-probe",
            externalSource: "gallery-test",
            userShowFoldersNav: true,
            userShowHelperChat: true,
            userShowDashboardBuilder: true,
            userShowDataModelNav: true,
            userShowManagementNav: true,
            userShowIntegrationsSettings: true,
            userShowCustomerJourneyHints: true,
            adminExposeFolderControls: true,
            adminExposeNavCustomize: true,
            adminExposeManagementRail: true,
            adminExposeSandboxPicker: false,
            adminExposeApiRegistryPicker: false,
            adminExposeHiddenObjects: false,
            adminAllowRailDividerOverrides: false,
            agentEnableBackgroundModule: true,
            agentEnableSettingsRead: true,
            agentEnableActionProposals: true,
            agentEnableJourneyNormalize: true,
            agentEnableValidatedDispatch: false,
            agentEnableCrmTrace: true,
          },
        ],
        binding: { mode: "manual", source: "CRM Settings Mirror" },
      },
    ],
  };
}

async function runProbes(base, label) {
  console.log(`\n[${label}] GET /api/workspace`);
  let res = await fetch(`${base}/api/workspace`);
  assert(res.ok, `${label} GET failed ${res.status}`);
  const getPayload = await res.json();
  assert(getPayload.workspaceConfig, `${label} missing workspaceConfig`);

  const isReadOnly = label.includes("read-only");

  console.log(`[${label}] PATCH unknown top-level field → 400 (allowlist)`);
  res = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ integrations: [] }),
  });
  assert(res.status === 400, `${label} expected 400 for integrations, got ${res.status}`);
  const bad = await res.json();
  assert(
    Array.isArray(bad.details) || String(bad.error || "").includes("unknown"),
    `${label} expected unknown field error`
  );

  console.log(`[${label}] PATCH crm-settings unknown toggle → ${isReadOnly ? "409 before validate" : "400"}`);
  res = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      dataModel: {
        objects: [
          {
            id: "crm-settings",
            label: "CRM Settings Mirror",
            objectType: "crm-settings",
            columns: ["id"],
            rows: [{ id: "mirror", notARealToggle: true }],
          },
        ],
      },
    }),
  });
  if (isReadOnly) {
    assert(res.status === 409, `${label} expected 409 for CRM PATCH on read-only, got ${res.status}`);
    const roCrm = await res.json();
    assert(String(roCrm.guidance || roCrm.error || "").length > 0, `${label} expected read-only guidance on CRM PATCH`);
  } else {
    assert(res.status === 400, `${label} expected 400 for unknown CRM field, got ${res.status}`);
    const badCrm = await res.json();
    assert(
      (badCrm.details || []).some((d) => String(d).includes("unknown CRM settings field")),
      `${label} expected unknown CRM settings field in details`
    );
  }

  console.log(`[${label}] PATCH valid crm-settings mirror`);
  res = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel: buildCrmSettingsPatch() }),
  });
  const patchText = await res.text();
  if (isReadOnly) {
    assert(res.status === 409, `${label} expected 409 read-only, got ${res.status}: ${patchText.slice(0, 400)}`);
    const ro = JSON.parse(patchText);
    assert(
      String(ro.guidance || ro.error || "").includes("WORKSPACE_CONFIG_ALLOW_FS_WRITE") ||
        String(ro.error || "").toLowerCase().includes("read-only"),
      `${label} expected read-only guidance`
    );
    return { readOnlyBlocked: true };
  }
  assert(res.ok, `${label} PATCH crm-settings failed ${res.status}: ${patchText.slice(0, 600)}`);
  const patched = JSON.parse(patchText);
  const crmObj = (patched.workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === "crm-settings");
  assert(crmObj, `${label} crm-settings object missing after PATCH`);
  const row = (crmObj.rows || []).find((r) => r?.id === "mirror");
  assert(row?.userShowCustomerJourneyHints === true, `${label} journey hint toggle not persisted`);
  assert(row?.agentEnableBackgroundModule === true, `${label} agent module toggle not persisted`);

  console.log(`[${label}] GET round-trip after PATCH`);
  res = await fetch(`${base}/api/workspace`);
  const round = await res.json();
  const crm2 = (round.workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === "crm-settings");
  assert(crm2?.rows?.[0]?.agentEnableCrmTrace === true, `${label} round-trip failed`);

  return { readOnlyBlocked: false, crmObj: crm2 };
}

async function main() {
  assert(fs.existsSync(path.join(APP_DIR, ".next")), `missing .next build in ${APP_DIR} — run pnpm run build first`);

  const fsChild = startServer(FS_PORT, { WORKSPACE_CONFIG_ALLOW_FS_WRITE: "true" });
  const roChild = startServer(RO_PORT, { GROWTHUB_WORKSPACE_DEPLOY_TARGET: "vercel" });

  const fsBase = `http://127.0.0.1:${FS_PORT}`;
  const roBase = `http://127.0.0.1:${RO_PORT}`;

  try {
    await waitFor(`${fsBase}/api/workspace`);
    await waitFor(`${roBase}/api/workspace`);
    console.log(`[ok] servers up: ${fsBase} (filesystem), ${roBase} (read-only)`);

    await runProbes(fsBase, "filesystem:3801");
    await runProbes(roBase, "read-only:3803");

    console.log("\n[probe] ALL GALLERY E2E CHECKS PASSED");
  } finally {
    for (const child of [fsChild, roChild]) {
      child.kill("SIGTERM");
      await sleep(400);
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
