export const PAPERCLIP_SKILL_BUNDLE_VERSION = 1 as const;

export interface KbSkillDocPayload {
  id: string;
  name: string;
  description: string;
  body: string;
  format: string;
  source: string;
}

export interface PaperclipSkillBundleItemV1 {
  id: string;
  name: string;
  format: string;
  source: string;
  bodySha256: string;
  bodyCharCount: number;
  truncated: boolean;
}

export interface PaperclipSkillBundleV1 {
  version: typeof PAPERCLIP_SKILL_BUNDLE_VERSION;
  items: PaperclipSkillBundleItemV1[];
  totalBodyBytes: number;
  limits: { maxTotalBytes: number };
  truncated: boolean;
}

/** Internal: bundle plus rendered bodies for markdown (not part of public meta payload). */
export interface BuiltSkillBundle extends PaperclipSkillBundleV1 {
  renderedBodies: string[];
}
