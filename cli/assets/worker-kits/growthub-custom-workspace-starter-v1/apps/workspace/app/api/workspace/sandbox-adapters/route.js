/**
 * GET /api/workspace/sandbox-adapters
 *
 * Lists every registered sandbox adapter — the default `local-process`
 * shipped at `lib/adapters/sandboxes/default-local-process.js` plus any
 * drop-zone adapter file added under `lib/adapters/sandboxes/adapters/`.
 *
 * Used by the Data Model drawer's adapter dropdown for the
 * `sandbox-environment` object type. Returns provider-agnostic metadata only.
 */

import { NextResponse } from "next/server";
import { describeRegisteredSandboxAdapters, ensureSandboxAdaptersLoaded } from "@/lib/adapters/sandboxes";

async function GET() {
  await ensureSandboxAdaptersLoaded();
  const adapters = describeRegisteredSandboxAdapters();
  return NextResponse.json({ adapters });
}

export { GET };
