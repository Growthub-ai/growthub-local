#!/usr/bin/env node
/**
 * PLG / activation KPI harness: GET `/api/workspace` → `POST /api/workspace/reference-options`
 * → `POST /api/workspace/sandbox-run`, plus assertions on the normalized sandbox receipt and
 * `growthub.source-records.json` append semantics.
 *
 * Usage (from repo root):
 *   node scripts/awac-golden-path-probe.mjs
 *   bash scripts/demo-cli.sh awac-golden-path
 *
 * Implementation: delegates to `runAwacWorkspaceApiProbe({ goldenPath: true })` in
 * `scripts/awac-workspace-api-probe.mjs`.
 */

import { runAwacWorkspaceApiProbe } from "./awac-workspace-api-probe.mjs";

await runAwacWorkspaceApiProbe({ goldenPath: true });
