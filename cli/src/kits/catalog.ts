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
  {
    id: "growthub-email-marketing-v1",
    packageDirName: "growthub-email-marketing-v1",
    defaultBundleId: "growthub-email-marketing-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
  },
  {
    id: "growthub-open-higgsfield-studio-v1",
    packageDirName: "growthub-open-higgsfield-studio-v1",
    defaultBundleId: "growthub-open-higgsfield-studio-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
  },
];
