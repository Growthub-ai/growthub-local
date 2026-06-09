/**
 * POST /api/workspace/register-api — governed creation lane.
 *
 * One atomic operation the Register API wizard and the helper register_api lane
 * both call. It produces a paired artifact:
 *
 *   - an api-registry CONFIG row (portable, in dataModel — written via the same
 *     gated writeWorkspaceConfig used by PATCH /api/workspace)
 *   - an optional RESOLVER FILE (executable server extension, written into the
 *     approved resolvers dir only, same gate as register-resolver)
 *
 * Ordering: the resolver file is written FIRST when required; if that write
 * fails the config row is never persisted, so a row never claims a resolver
 * that is not on disk (no fake "ready").
 *
 * mode "propose" → returns the plan (no writes) for wizard preview.
 * mode "apply"   → writes the artifacts, returns a structured receipt.
 *
 * Secrets never appear here: only the authRef slug travels in config; the value
 * lives in .env.local and resolves server-side at run/test time. Read-only
 * runtimes return 409 with guidance instead of pretending.
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig,
} from "@/lib/workspace-config";
import { createTypedBusinessObject } from "@/lib/workspace-data-model";
import { buildApiRegistrationPlan, summarizePlanReadiness } from "@/lib/api-registration";
import { isEnvRefResolved } from "@/lib/workspace-env-resolver";

const RESOLVERS_DIR_REL = "lib/adapters/integrations/resolvers";

function readOnly409(persistence) {
  return NextResponse.json(
    {
      ok: false,
      error: "this runtime is read-only — config/resolver writes are disabled",
      reason: persistence.reason,
      guidance: persistence.guidance,
      persistence,
    },
    { status: 409 }
  );
}

async function writeResolverFile(filename, source) {
  if (!source.includes("registerSourceResolver")) {
    const e = new Error("generated resolver must call registerSourceResolver()");
    e.code = "INVALID_RESOLVER_SOURCE";
    throw e;
  }
  const resolversDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), RESOLVERS_DIR_REL);
  const outPath = path.join(resolversDir, filename);
  if (path.dirname(outPath) !== resolversDir) {
    const e = new Error("invalid resolver filename — path traversal not allowed");
    e.code = "RESOLVER_PATH_REFUSED";
    throw e;
  }
  await fs.mkdir(resolversDir, { recursive: true });
  await fs.writeFile(outPath, source, "utf8");
  return `${RESOLVERS_DIR_REL}/${filename}`;
}

/** Append the api-registry row to the existing object, or create the object. */
function applyRowToConfig(config, plan) {
  const row = plan.config.row;
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  if (plan.config.mode === "row.add" && plan.config.objectId) {
    const nextObjects = objects.map((object) =>
      object?.id === plan.config.objectId
        ? { ...object, rows: [...(Array.isArray(object.rows) ? object.rows : []), row] }
        : object
    );
    return { ...config, dataModel: { ...config.dataModel, objects: nextObjects } };
  }
  const seeded = createTypedBusinessObject(config, { name: "API Registry", objectType: "api-registry" });
  const seededObjects = seeded.dataModel.objects.map((object) =>
    object?.objectType === "api-registry" && (!Array.isArray(object.rows) || object.rows.length === 0)
      ? { ...object, rows: [row] }
      : object
  );
  return { ...seeded, dataModel: { ...seeded.dataModel, objects: seededObjects } };
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const mode = String(body?.mode || "propose").trim().toLowerCase();
  const input = body?.input && typeof body.input === "object" ? body.input : {};

  const config = await readWorkspaceConfig();
  const plan = buildApiRegistrationPlan(input, { existingConfig: config, env: process.env });

  if (!plan.valid) {
    return NextResponse.json({ ok: false, error: "invalid registration input", details: plan.errors, plan }, { status: 400 });
  }
  if (mode === "propose") {
    return NextResponse.json({ ok: true, mode: "propose", plan });
  }
  if (mode !== "apply") {
    return NextResponse.json({ ok: false, error: `unknown mode "${mode}"` }, { status: 400 });
  }

  const persistence = describePersistenceMode();
  if (persistence.mode !== "filesystem" || !persistence.canSave) {
    return readOnly409(persistence);
  }

  // 1) Resolver file FIRST (when required) so the config row never claims an
  //    executable extension that is not on disk.
  let resolverReceipt = { required: false };
  if (plan.resolver.required) {
    try {
      const writtenPath = await writeResolverFile(plan.resolver.filename, plan.resolver.source);
      resolverReceipt = { required: true, written: true, path: writtenPath, integrationId: plan.resolver.integrationId };
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "resolver file write failed — API Registry row was NOT created and nothing was activated",
          reason: error.message,
          recovery: "Fix the resolver source or choose raw-response mode, then re-apply.",
          resolver: { required: true, written: false, path: plan.resolver.path },
        },
        { status: 500 }
      );
    }
  }

  // 2) Persist the config row through the same gated writer as PATCH.
  let nextConfig;
  try {
    const candidate = applyRowToConfig(config, plan);
    nextConfig = await writeWorkspaceConfig({ dataModel: candidate.dataModel });
  } catch (error) {
    if (error.code === "WORKSPACE_PERSISTENCE_READ_ONLY") return readOnly409(persistence);
    return NextResponse.json(
      {
        ok: false,
        error: "config write failed after resolver write",
        reason: error.message,
        resolver: resolverReceipt,
        recovery: resolverReceipt.written
          ? `Resolver ${resolverReceipt.path} was written but the API Registry row was not saved. Re-apply to converge, or remove the file.`
          : "Re-apply once the issue is resolved.",
      },
      { status: 500 }
    );
  }

  const activation = summarizePlanReadiness(plan, {
    resolverPresent: resolverReceipt.required ? resolverReceipt.written === true : false,
    row: { ...plan.config.row },
  });

  return NextResponse.json({
    ok: true,
    mode: "apply",
    integrationId: plan.integrationId,
    config: { applied: true, mode: plan.config.mode, objectId: plan.config.objectId },
    resolver: resolverReceipt,
    env: { ...plan.env, configured: plan.env.required ? isEnvRefResolved(plan.config.row.authRef) : false },
    testPlan: plan.testPlan,
    activation,
    workspaceConfig: nextConfig,
  });
}

export { POST };
