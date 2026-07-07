/**
 * GET /api/workspace/training-readiness[?folder=<path>]
 *
 * The honest local-substrate signal the Training Runtime configuration step
 * needs: which base models are REALLY installed (Ollama tags), which storage
 * folders REALLY exist and accept writes (external /Volumes drives + the
 * workspace artifacts fallback), whether the pipeline tooling is present, and
 * whether the machine preflight (RAM/disk/GPU) is measurable. Read-only and
 * bounded — it observes, never creates, pulls, or mutates. The modal's
 * dropdowns offer ONLY what this returns, so a selectable option is always a
 * real one.
 *
 * `?folder=` verifies one specific artifact folder (containment + writability)
 * for the "choose a specific folder" path — returned as `folderCheck`.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { collectTrainingLocalReadiness } from "@/lib/training-local-readiness-probe";

export const dynamic = "force-dynamic";

async function GET(request) {
  let workspaceConfig = {};
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch {
    workspaceConfig = {};
  }
  let folder = "";
  try {
    folder = new URL(request.url).searchParams.get("folder") || "";
  } catch {
    folder = "";
  }
  const readiness = await collectTrainingLocalReadiness({ workspaceConfig, folder });
  return NextResponse.json(readiness);
}

export { GET };
