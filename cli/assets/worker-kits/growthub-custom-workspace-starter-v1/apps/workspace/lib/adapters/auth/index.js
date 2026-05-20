import { isAuthGateEnabled, readAuthGateConfig } from "@/lib/auth";
import { readAdapterConfig } from "../env";
function describeAuthAdapter() {
  const gate = readAuthGateConfig();
  if (isAuthGateEnabled()) {
    return {
      id: "env-gate",
      requiredEnv: [
        "GROWTHUB_WORKSPACE_AUTH_GATE",
        "GROWTHUB_WORKSPACE_GATE_USERNAME",
        "GROWTHUB_WORKSPACE_GATE_PASSWORD or GROWTHUB_WORKSPACE_GATE_PASSWORD_HASH"
      ],
      notes: [
        "Optional workspace login gate for local and Vercel serverless deployments.",
        "Session cookie is httpOnly; secrets never ship to the client bundle."
      ],
      gate
    };
  }
  const { authAdapter } = readAdapterConfig();
  if (authAdapter === "oidc") {
    return {
      id: "oidc",
      requiredEnv: ["AUTH_SECRET", "AUTH_ISSUER", "AUTH_CLIENT_ID", "AUTH_CLIENT_SECRET"],
      notes: ["Default portable auth contract for Vercel and local serverless use."]
    };
  }
  if (authAdapter === "clerk") {
    return { id: "clerk", requiredEnv: [], notes: ["Configure Clerk-specific env in the deployment target."] };
  }
  if (authAdapter === "authjs") {
    return { id: "authjs", requiredEnv: ["AUTH_SECRET"], notes: ["Use Auth.js provider configuration in app code."] };
  }
  return { id: "provider-managed", requiredEnv: [], notes: ["Auth is managed outside the kit contract."] };
}
export {
  describeAuthAdapter
};
