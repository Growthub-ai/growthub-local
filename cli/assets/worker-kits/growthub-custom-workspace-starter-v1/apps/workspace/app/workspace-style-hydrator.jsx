"use client";

import { useEffect } from "react";
import { injectBrandKitTokens, mergeBrandKitDefaults } from "@/lib/brand-kit-injector";

export function WorkspaceStyleHydrator() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace", { cache: "no-store" });
        const payload = await res.json();
        if (cancelled || !res.ok) return;
        const bk = payload.workspaceConfig?.branding?.brandKit;
        if (bk) injectBrandKitTokens(mergeBrandKitDefaults(bk));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
