import type { KitCapabilityType, KitExecutionMode, KitActivationMode, KitFamily } from "./contract.js";

export interface BundledKitCatalogEntry {
  id: string;
  packageDirName: string;
  defaultBundleId: string;
  type: KitCapabilityType;
  executionMode: KitExecutionMode;
  activationModes: KitActivationMode[];
  family: KitFamily;
}

export const BUNDLED_KIT_CATALOG: BundledKitCatalogEntry[] = [
  {
    id: "growthub-custom-workspace-starter-v1",
    packageDirName: "growthub-custom-workspace-starter-v1",
    defaultBundleId: "growthub-custom-workspace-starter-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio",
  },
  {
    id: "growthub-agency-portal-starter-v1",
    packageDirName: "growthub-agency-portal-starter-v1",
    defaultBundleId: "growthub-agency-portal-starter-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio",
  },
];
