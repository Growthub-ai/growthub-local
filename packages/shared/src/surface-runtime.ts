import type { SurfaceProfile } from "./constants.js";

export type SurfaceRuntimeContract = Readonly<{
  profile: SurfaceProfile;
  mounts: Readonly<{
    routes: "/dx" | "/gtm";
    cli: SurfaceProfile;
  }>;
  capabilities: Readonly<{
    dxEnabled: boolean;
    gtmEnabled: boolean;
  }>;
}>;

let runtimeContract: SurfaceRuntimeContract | null = null;

function buildSurfaceRuntimeContract(profile: SurfaceProfile = "dx"): SurfaceRuntimeContract {
  if (profile === "gtm") {
    return Object.freeze({
      profile: "gtm",
      mounts: Object.freeze({
        routes: "/gtm",
        cli: "gtm",
      }),
      capabilities: Object.freeze({
        dxEnabled: false,
        gtmEnabled: true,
      }),
    });
  }

  return Object.freeze({
    profile: "dx",
    mounts: Object.freeze({
      routes: "/dx",
      cli: "dx",
    }),
    capabilities: Object.freeze({
      dxEnabled: true,
      gtmEnabled: false,
    }),
  });
}

export function initializeSurfaceRuntimeContract(profile: SurfaceProfile = "dx"): SurfaceRuntimeContract {
  if (runtimeContract && runtimeContract.profile === profile) return runtimeContract;
  runtimeContract = buildSurfaceRuntimeContract(profile);
  return runtimeContract;
}

export function getSurfaceRuntimeContract(): SurfaceRuntimeContract {
  if (!runtimeContract) {
    throw new Error("Surface runtime contract accessed before bootstrap initialization");
  }
  return runtimeContract;
}
