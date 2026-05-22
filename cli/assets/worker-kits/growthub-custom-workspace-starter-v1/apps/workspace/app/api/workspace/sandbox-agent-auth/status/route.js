/**
 * POST /api/workspace/sandbox-agent-auth/status
 *
 * Probes the local agent CLI for a sandbox row whose adapter is
 * `local-agent-host`. The probe is host-agnostic — each host's reachability
 * + auth-status subcommand lives in `lib/sandbox-agent-host-catalog.js`.
 *
 * Status semantics (uniform across every host):
 *   - "active"    a real auth probe confirmed authentication
 *   - "reachable" CLI is callable but auth NOT yet confirmed
 *   - "stale"    CLI reachable but auth-shaped failure detected
 *   - "missing"  binary not on PATH
 *   - "unknown"  indeterminate
 *
 * A `--version` (or equivalent) probe NEVER promotes to "active" — the
 * next sandbox-run is the source of truth for session readiness.
 *
 * Side effect: stamps `agentAuthStatus` + sibling fields onto the row so
 * the Data Model record drawer surfaces the result without a follow-up
 * load.
 *
 * Request body:
 *   { objectId: string, name: string }
 *
 * Response (success):
 *   {
 *     ok: boolean,
 *     status: "active" | "reachable" | "stale" | "missing" | "unknown",
 *     provider: string,
 *     label: string,
 *     binary: string,
 *     cwd: string,
 *     exitCode: number | null,
 *     probe: "auth-status" | "version",
 *     stdout: string,
 *     stderr: string,
 *     message: string,
 *     checkedAt: string
 *   }
 */

import { NextResponse } from "next/server";
import { checkAgentStatus } from "@/lib/sandbox-agent-auth";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const objectId = typeof body?.objectId === "string" ? body.objectId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!objectId || !name) {
    return NextResponse.json(
      { ok: false, error: "objectId and name are required" },
      { status: 400 }
    );
  }

  try {
    const result = await checkAgentStatus({ objectId, name });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Agent auth status check failed",
        code: error?.code || null
      },
      { status: error?.code === "SANDBOX_AGENT_AUTH_NOT_FOUND" ? 404 : 400 }
    );
  }
}

export { POST };
