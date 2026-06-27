import { NextResponse } from "next/server";
import {
  getMarketplaceProvider,
} from "@/lib/workspace-add-ons";
import { readEnvVar } from "@/lib/server-secrets";
import { requireWorkspaceOperator } from "@/lib/workspace-operator-auth";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function resolvedEnvKeys(keys) {
  return (Array.isArray(keys) ? keys : []).filter((key) => Boolean(readEnvVar(key, process.env)));
}

async function POST(_request, context) {
  const params = await context?.params;
  const providerId = clean(params?.providerId);
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return jsonError("unknown marketplace provider", 404, { providerId });

  const auth = requireWorkspaceOperator(_request);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const connectUrl = provider.accountSetupUrl || provider.consoleUrl;
  const requiredEnv = [provider.accountProbe?.emailEnv, provider.accountProbe?.keyEnv].filter(Boolean);
  const resolvedEnv = resolvedEnvKeys(requiredEnv);

  return NextResponse.json({
    ok: true,
    providerId: provider.providerId,
    connectUrl,
    accountState: "setup-opened",
    setup: {
      account: provider.providerId,
      requiredEnv,
      missingEnv: requiredEnv.filter((key) => !resolvedEnv.includes(key)),
      resolvedEnv,
    },
  });
}

export { POST };
