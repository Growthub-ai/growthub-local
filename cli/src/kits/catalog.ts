import type { KitCapabilityType, KitExecutionMode, KitActivationMode } from "./contract.js";

export interface BundledKitCatalogEntry {
  id: string;
  packageDirName: string;
  defaultBundleId: string;
  type: KitCapabilityType;
  executionMode: KitExecutionMode;
  activationModes: KitActivationMode[];
}

export const BUNDLED_KIT_CATALOG: BundledKitCatalogEntry[] = [
  {
    id: "creative-strategist-v1",
    packageDirName: "creative-strategist-v1",
    defaultBundleId: "creative-strategist-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
  },
];

