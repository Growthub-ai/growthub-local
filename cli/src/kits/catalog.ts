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
    id: "creative-strategist-v1",
    packageDirName: "creative-strategist-v1",
    defaultBundleId: "creative-strategist-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "workflow",
  },
  {
    id: "growthub-email-marketing-v1",
    packageDirName: "growthub-email-marketing-v1",
    defaultBundleId: "growthub-email-marketing-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "operator",
  },
  {
    id: "growthub-open-higgsfield-studio-v1",
    packageDirName: "growthub-open-higgsfield-studio-v1",
    defaultBundleId: "growthub-open-higgsfield-studio-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio",
  },
  {
    id: "growthub-geo-seo-v1",
    packageDirName: "growthub-geo-seo-v1",
    defaultBundleId: "growthub-geo-seo-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio",
  },
  {
    id: "growthub-postiz-social-v1",
    packageDirName: "growthub-postiz-social-v1",
    defaultBundleId: "growthub-postiz-social-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio",
  },
  {
    id: "growthub-open-montage-studio-v1",
    packageDirName: "growthub-open-montage-studio-v1",
    defaultBundleId: "growthub-open-montage-studio-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio",
  },
  {
    id: "growthub-ai-website-cloner-v1",
    packageDirName: "growthub-ai-website-cloner-v1",
    defaultBundleId: "growthub-ai-website-cloner-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio",
  },
  {
    id: "growthub-twenty-crm-v1",
    packageDirName: "growthub-twenty-crm-v1",
    defaultBundleId: "growthub-twenty-crm-v1",
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
    family: "studio",
  },
];
