export type SurfaceProfile = "dx" | "gtm";

export type SurfaceRuntimeCapabilities = {
  dxEnabled: boolean;
  gtmEnabled: boolean;
};

export type SurfaceRuntimeContract = {
  profile: SurfaceProfile;
  capabilities: SurfaceRuntimeCapabilities;
};
