"use client";

import { useEffect } from "react";
import { injectBrandKitTokens } from "@/lib/brand-kit-injector";
import { mergeBrandKitDefaults } from "@/lib/brand-kit-defaults";

export function BrandKitBootstrap() {
  useEffect(() => {
    fetch("/api/workspace", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        const raw = payload.workspaceConfig?.branding?.brandKit;
        injectBrandKitTokens(mergeBrandKitDefaults(raw));
      })
      .catch(() => {
        injectBrandKitTokens(mergeBrandKitDefaults(null));
      });
  }, []);
  return null;
}
