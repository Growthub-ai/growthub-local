export type WorktreeUiBranding = {
    enabled: boolean;
    name: string | null;
    color: string | null;
    textColor: string | null;
    faviconHref: string | null;
};
export declare function isWorktreeUiBrandingEnabled(env?: NodeJS.ProcessEnv): boolean;
export declare function getWorktreeUiBranding(env?: NodeJS.ProcessEnv): WorktreeUiBranding;
export declare function renderFaviconLinks(branding: WorktreeUiBranding): string;
export declare function renderRuntimeBrandingMeta(branding: WorktreeUiBranding, surfaceProfile?: SurfaceProfile): string;
export declare function applyUiBranding(html: string, env?: NodeJS.ProcessEnv, surfaceProfile?: SurfaceProfile): string;
import type { SurfaceProfile } from "@paperclipai/shared";
//# sourceMappingURL=ui-branding.d.ts.map