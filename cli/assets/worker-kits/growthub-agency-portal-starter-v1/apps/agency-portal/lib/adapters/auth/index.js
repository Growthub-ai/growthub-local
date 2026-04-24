import { readAdapterConfig } from "../env";
function describeAuthAdapter() {
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
